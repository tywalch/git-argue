//const _ = require('lodash');
//const RSVP = require('rsvp');
const spawn = require('child_process').spawn;
const byline = require('byline');
const util = require('util');
const colog = require('colog');
const NOOP = function() {};
const DEFAULT_OPTS = {
  ignoreWhitespace: true,
  email: false,
  batchSize: 4,
  logger: NOOP,
  onBlameCount: NOOP,
  onBlameComplete: NOOP
};
const BLAME_RX =       /^[^(]*\((.*?)\s+\d{4}-\d{2}-\d{2}/;
const BLAME_EMAIL_RX = /^[^(]*\(<(.*?)>\s+\d{4}-\d{2}-\d{2}/;
const LINE_META_RX = /^[\^\w]{7,9}\s[\w\/.]*\s*\([\w\s-:@.]*\)\s/;
const SET_NUMBER_RX = /^\d+\)\s/;

function successResponse(result) {
  console.log('SUCCESS!', result);
}
function failuireResponse(result) {
  console.log('FAILURE!', result);
}

function displayLine(str, num, owner, alter) {
  const LINE_NUM_LENGTH = 4;
  const OWNER_LENGTH = 25;
  const lineString = num.toString();
  const lineDisplay = lineString.padEnd(LINE_NUM_LENGTH);
  const ownerDisplay = owner.padEnd(OWNER_LENGTH)
  const alterDisplay = alter.padStart(2);
  return `${str[0]}${lineDisplay}${str[1]}${ownerDisplay}${str[2]}${alterDisplay}`
}

function getDiffSymbols(removed, added) {
  const total = removed + added;
  const needsModification = total > 15;
  let negative = removed;
  let positive = added;
  if (needsModification) {
	  negative = Math.round(removed/total * 15);
    positive = 15 - negative;
  }
  return [Array(negative ? negative + 1 : positive).join('-'), Array(positive ? positive + 1 : positive).join('+')]
}

function git(args, opts) {
  return new Promise(function(resolve, reject) {
    const gitProc = spawn('git', args, {
      cwd: opts.cwd,
      stdio: (opts.stderr) ? ['pipe', 'pipe', process.stderr] : undefined,
      env: opts.env
    });
    const gitStream = byline(gitProc.stdout);
    let line = 0;
    gitStream.on('data', function(buff) {
      opts.onLine && opts.onLine(buff.toString(), ++line);
    });
    gitProc.on('close', function() {
      opts.onClose && opts.onClose();
    });
    gitProc.on('exit', function (code) {
      if (code) {
        reject('git ' + args.join(' ') + ' exited with ' + code);
      } else {
        resolve();
      }
    });
  });
}

function accuse(path, changes, time, opts) {
  return new Promise(function(resolve, reject) {
    const at = opts[time];
    let args = [`blame`, at, `--`, `${opts.repoPath}/${path}`];
    function onLine(line, i) {
      const matchedLine = changes.has(i);
      if (matchedLine) {
        cleanLine = line.replace(LINE_META_RX, '');
        const owner = BLAME_RX.exec(line)[1].trim() || BLAME_EMAIL_RX.exec(line)[1].trim();
        const ownerMatchesUser = owner === opts.user//owner === 'tywalch' || owner === 'twalch@extensifi.com';
        if (time === 'since' ) {//&& ownerMatchesUser) {
          let changeSet = changes.get(i);
          changeSet.owned = changeSet.owned || new Map();
          changeSet.owned.set(i, [owner, cleanLine, !ownerMatchesUser]); 
        } else if (time === 'until' ){//&& !ownerMatchesUser) {
          let changeSet = changes.get(i);
          changeSet.overwriten = changeSet.overwriten || new Map();
          changeSet.overwriten.set(i, [owner, cleanLine, ownerMatchesUser]); 
        }
      }
    }

    function onClose() {
      changes.forEach(set => {
        if (set.overwriten) {
          set.allRemovalsAreOwner = true;
          set.overwriten.forEach(line => {
            const lineMatchesOwner = line[2]
            if (!lineMatchesOwner) {
              set.allRemovalsAreOwner = false;
            }
          })
        }
      })
      return resolve(changes);
    }

    if (opts === undefined && typeof at === 'object') {
      opts = at;
      at = undefined;
    }

    /*if (opts.ignoreWhitespace)*/ args.splice(2, 0, "-w");
    if (opts.email) args.splice(2, 0, "-e");

    git(args, {
      cwd: opts.repoPath,
      logger: opts.logger,
      onLine,
      onClose
    }).catch(reject);
  });
}

function getLineOwners(changeSets, changeFiles, time, opts) {
  const ownedFiles = []
  for (const file in changeSets) {
    if (changeFiles.modified.indexOf(file) !== -1) {
      const lines = changeSets[file] ? changeSets[file][time] : false;
      if (lines) {
        ownedFiles.push(accuse(file, lines, time, opts))
      }
    }
  }
  
  return Promise.all(ownedFiles)
}


function exec(repoPath, args, opts) {
  return new Promise(function(resolve, reject) {
    let lines = [];
    git(args, {
      cwd: repoPath,
      onLine: function(line, i) {
        lines.push(line);
      },
      onClose: function() {
        resolve(lines);
      },
    }).catch(reject);
  });
}

function findRepoPath(opts) {
  return new Promise(function(resolve, reject) {
    if (opts.repoPath) {
      resolve(opts.repoPath);
    } else {
      git(["rev-parse", "--show-toplevel"], {
        cwd: opts.repoSubdir || process.cwd(),
        onLine: resolve,
        logger: opts.logger
      }).catch(function(err) {
        console.log('Error identifying current repo path');
        return reject(err);
      });
    }
  });
}

function parseFileDelta(fileDelta) {
  const regex = {
    modified: /^M\t/,
    deleted: /^D\t/
  };
  const delta = {
    modified: [],
    deleted: []
  };
  function reduceDelta(result, file) {
    if (regex.modified.test(file)) {
      result.modified.push(file.replace(regex.modified, ''));
    } else if (regex.deleted.test(file)) {
      result.deleted.push(file.replace(regex.deleted, ''));
    }
    return result;
  }
  return fileDelta.reduce(reduceDelta, delta);
}

function identifyChangeSets(lineDelta) {
  const lineTypes = {
    FILENAME: 'FILENAME',
    DIFF: 'DIFF',
    ADDITION: 'ADDITION',
    REMOVAL: 'REMOVAL',
    IGNORE: 'IGNORE'
  }
  const regex = {
    added: /^\+\s/,
    removed: /^\-\s/,
    file: /^(--- a\/)/,
    ignore: /^[\s]/,
    change: /^@@ [\-\d\+,\s]+ @@/
  };

  function getLineType(line) {
    if (regex.file.test(line)) return lineTypes.FILENAME
    else if (regex.change.test(line)) return lineTypes.DIFF
    else if (regex.removed.test(line)) return lineTypes.REMOVAL
    else if (regex.added.test(line)) return lineTypes.ADDITION
    else if (regex.ignore.test(line)) return lineTypes.IGNORE
    else return ''
  }

  function reduceDelta(result, line) {
    const type = getLineType(line);
    switch (type) {
      case lineTypes.FILENAME: 
        if (result.data[result.file] && Object.keys(result.data[result.file]).length === 0) delete result.data[result.file];
        const file = line.replace(regex.file, '');
        result.newFile(file)
        break;
      case lineTypes.DIFF:
        if (!result.file) break;
        const id = regex.change.exec(line)[0].split('@@')[1].trim();
        //const start = id.split(' ')[0].replace('-', '').split(',')[0]
        const start = [id.split(' ')[0].replace('-', '').split(',')[0], id.split(' ')[1].replace('+', '').split(',')[0]]
        result.newSet(id, start);
        break;
      case lineTypes.REMOVAL:
        if (!result.file) break;
        result.remove();
        break;
      case lineTypes.ADDITION:
        if (!result.file) break;
        result.add();
        break;
      case lineTypes.IGNORE:
        result.next();
        break;
      default:
        result.reset();
    }
    return result;
  }
  const fileChangeSets = lineDelta.reduce(reduceDelta, {
    setIterator: 0,
    last: '',
    set: '',
    file: '',
    data: {},
    reset() {
      this.removalMode = false;
      this.last = '';;
      return this;
    },
    newFile(name) {
      this.set = '';
      this.file = name;
      this.data[this.file] = {};
      this.removalMode = false;
      this.reset();
    },
    newSet(id, start) {
      this.set = id;
      this.data[this.file][this.set] = {
        removals: [],
        additions: [],
        lines: {
          start,
          removal: start[1],
          addition: start[0]
        }
      };
      this.removalMode = false;
    },
    get currentSet() {
      return this.data[this.file] ? this.data[this.file][this.set] : {}
    },
    remove(line) {
      this.currentSet.removals.push(this.currentSet.lines.removal++)
      this.removalMode = true;
      this.last = '-'
      return this;
    },
    add(line) {
      this.currentSet.additions.push(this.currentSet.lines.addition++)
      this.last = '+'
      return this
    },
    next() {
      this.currentSet.lines.addition++;
      this.currentSet.lines.removal++;
      if (this.last === '+') {
        this.setIterator++;
        this.newSet(this.set + ',' + this.setIterator, [this.currentSet.lines.removal, this.currentSet.lines.addition])
      } else {
        this.setIterator = 0;
      }
      return this.reset();
    },
  }).data;

  let changes = {}; 
  for (const file in fileChangeSets) {
    const setMap = Object.values(fileChangeSets[file]).reduce((result, set) => {
      if (set.removals.length ) {//&& set.additions.length) {
        const modifications = {
          removals: [...set.removals],
          additions: [...set.additions]
        }
        result.since = result.since || new Map();
        result.until = result.until || new Map();
        result.sets = result.sets || new Set();
        result.sets.add(modifications);
        set.removals.forEach(line => {
          result.since.set(line, modifications);
        })
        set.additions.forEach(line => {
          result.until.set(line, modifications);
        })
      }
      
      return result;
    }, {})
    if (setMap.sets && setMap.sets.size) {
      changes[file] = setMap;
    }
  }
  return changes;
}

function findGitUser(opts) {
  const args = ['config', 'user.name'];
  return exec(opts.repoPath, args, opts);
}

function findFileDelta(opts) {
  const args = ['--no-pager', 'diff', '--name-status', opts.since, opts.until];
  return exec(opts.repoPath, args, opts);
}

function identifyChangedLines(opts) {
  const args = ['--no-pager', 'diff', opts.since, opts.until];
  return exec(opts.repoPath, args, opts);
}

async function argue(opts) {
  opts = Object.assign({}, DEFAULT_OPTS, opts);
  if (opts.at && (opts.since || opts.until)) {
    throw 'opts.sha can\'t be used in conjunction with opts.since or opts.until';
  }

  if (opts.until && !opts.since) {
    throw 'opts.until can\'t be specified without opts.since';
  }

  if (!(opts.at || opts.since)) {
    opts.at = 'HEAD';
  }

  function identifyCulprits(changedLines) {
    const guilty = {};
    const stats = {};
    for (const file in changedLines) {
      const since = changedLines[file]['since'];
      const fileSets = changedLines[file]['sets']
      if (fileSets) {
        let i = -1;
        fileSets.forEach(line => {
          if (line.allRemovalsAreOwner) return 
          if (line.owned && line.owned.size ) {
            ++i;
            const hasOwned = Array.from(line.owned).find(owned => Array.isArray(owned[1]) && !owned[1][2])
            if (hasOwned) {
              const hasCulprit = line.overwriten;
              guilty[file] = guilty[file] || {};
              stats[file] = stats[file] || {
                removed: 0,
                added: 0,
                culprintOwners: new Set()
              };
              line.owned.forEach((name, j) => {
                stats[file].removed++;
                guilty[file][i] = guilty[file][i] || [];
                guilty[file][i][j] = guilty[file][i][j] || [];
                guilty[file][i][j][0] = displayLine`${j} ${name[0]}${name[1]}`
                guilty[file][i][j][3] = name[2];
                if (!hasCulprit) {
                  
                }
              })
              if (hasCulprit) {
                line.overwriten.forEach((name, j) => {
                  stats[file].added++;
                  stats[file].culprintOwners.add(name[0]);
                  guilty[file][i] = guilty[file][i] || [];
                  guilty[file][i][j] = guilty[file][i][j] || [];
                  guilty[file][i][j][1] = displayLine`${j} ${name[0]}${name[1]}`
                  guilty[file][i][j][2] = name[2];
                })
              }
            }
          }
        });
      }
    }
    return {
      guilty,
      stats
    }
  }

  function printEachLine(type) {
    return function(line) {
      const hasRemoval = line[0];
      const hasAddition = line[1];
      const muteAdditon = line[2];
      const muteRemoval = line[3];
      if (hasRemoval && type === 'removals') {
        if (muteRemoval) {
          console.log(` `, '\x1b[2m', colog.red(hasRemoval), '\x1b[0m')
        } else {
          colog.log(colog.yellow(`   `) + colog.red(hasRemoval))
        }
      } else if (hasAddition && type === 'additions') {
        if (muteAdditon) {
          console.log(` `, '\x1b[2m', colog.green(hasAddition), '\x1b[0m')
        } else {
          colog.log(colog.yellow(`   `) + colog.green(hasAddition))
        }
        
      }
    }
  }

  function printEachSet(changeSet, i, arr) {
    if (i > 0) console.log();
    const printRemovals = printEachLine('removals');
    const printAdditions = printEachLine('additions');
    changeSet.forEach(printRemovals)
    changeSet.forEach(printAdditions)
  }
  
  function displayCulprits(culprits, culpritStats) {
    for (const file in culprits) {
      const changeSets = Object.values(culprits[file]).filter(line => {
        return line;
      });
      const stats = culpritStats[file];
      const changeSymbols = getDiffSymbols(stats.removed, stats.added);
      colog.log(colog.b(colog.white(file) + ' ' + colog.red(changeSymbols[0]) + colog.green(changeSymbols[1])));
      if (stats.culprintOwners.size) {
        let culpritNames = "| "
        stats.culprintOwners.forEach(name => {
          culpritNames = culpritNames + name + ` | `
        })
        colog.log(colog.b(colog.yellow(culpritNames)))
      }
      
      changeSets.forEach(printEachSet)
      console.log()
    }
    if (!Object.keys(culprits).length) {
      colog.log(colog.b(colog.green('Your code is safe')));
    } 
  }
  try {
  opts.repoPath = await findRepoPath(opts);
  opts.user = (await findGitUser(opts))[0];
  const changedFiles = await findFileDelta(opts).then(parseFileDelta)
  const changedLines = await identifyChangedLines(opts).then(identifyChangeSets)
  const getSince = await getLineOwners(changedLines, changedFiles, 'since', opts);
  const getUntil = await getLineOwners(changedLines, changedFiles, 'until', opts);
  const culprits = identifyCulprits(changedLines);
  displayCulprits(culprits.guilty, culprits.stats);
  } catch (err) {
    console.log(err)
  }
}
module.exports = argue;