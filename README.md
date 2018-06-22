# git-argue
###### Don't touch my Git
Displays changes made between two commits that affected your code and who made the changes.

## Usage
     git-argue [options] [<since>] [<until>]
     git-argue [options] [-a|--all] <commit-ish>

     Options:
         -h, --help               output usage information
         -d, --dir <path>         force git-argue to run in the specified directory rather than attempt to detect the repository root
      
## Installation

- Install [Git](http://git-scm.com/), [Node.js](http://nodejs.org/) (tested against v0.10.3) and [npm](https://npmjs.org/)
- Run ``npm install -g git-argue``. You may need ``sudo``.
- Run ``git-argue HEAD~1 HEAD`` in any git repository to see the blame delta for the last commit.

## Examples

Find blame delta from the last commit:

	$ git-argue HEAD~1 HEAD