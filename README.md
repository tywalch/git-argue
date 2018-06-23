# git-argue
###### Don't touch my Git
Displays changes made between two commits that affected your code and who made the changes.

## Usage
     git-argue [options] [<since>] [<until>]
     git-argue [options] [-d|--dir] <path>

     Options:
         -h, --help               output usage information
         -d, --dir <path>         force git-argue to run in the specified directory rather than attempt to detect the repository root
      
## Installation

- Install [Git](http://git-scm.com/), [Node.js](http://nodejs.org/), and [npm](https://npmjs.org/)
- Run ``npm install -g git-argue``. You may need ``sudo``.
- Run ``git-argue HEAD~1 HEAD`` in any git repository to see the blame delta for the last commit.

## Examples

Find blame delta from the last commit:

	$ git-argue HEAD~1 HEAD

When installed globally:

	$ git argue HEAD~1 HEAD

    lib/models/sequelize/users.js ---+++
    | tywalch | Harry Wazzell |
      7    tywalch                      EndUserName: {
      8    tywalch                        type: DataTypes.STRING,
      7    tywalch                      EndUserNameKey: {
      8    Harry Wazzell                  type: DataTypes.UUID,
      
      11   tywalch                        validate: validations.validate('Username', validations.presets.GUID)
      11   Harry Wazzell                  validate: validations.validate('End Username Key', validations.presets.GUID)

