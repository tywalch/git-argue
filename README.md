# git-argue
###### Don't touch my Git
A novelty app for office jerk to protect their code at all costs. Displays changes to specifically your code between two commits as well as who's desk to walk over to and argue.

This code was written as a fun project to play around with a few concepts. The script's name is in jest and it is not intended to contribute to a toxic collaborative environment. Here are some ideas for it's positive use:
1. Improve code     

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

