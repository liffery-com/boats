import { BoatsRC } from '@/interfaces/BoatsRc';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import { QuestionCollection } from 'inquirer';
import upath from 'upath';
import boatsPackageJson from '../package.json';

const pwd = upath.toUnix(process.cwd());
const srcPath = upath.join(pwd, '/src');
const srcAlreadyExists = fs.pathExistsSync(srcPath);
const buildPath = upath.join(pwd, '/build');
const buildAlreadyExists = fs.pathExistsSync(srcPath);

const npmInstall = (): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['install'], {
      stdio: 'inherit',
      cwd: pwd
    }).on('close', (code) => {
      if (code !== 0) {
        return reject(Error('npm install command was unsuccessful'));
      }

      resolve(0);
    });
  });

const localPkgJsonPath = upath.join(pwd, 'package.json');

const getQuestions = (localPkgJson: Record<string, any>): QuestionCollection => {
  return [
    {
      type: 'input',
      name: 'name',
      message: 'Enter the name of the api file, press enter to use the current package.json name attribute:',
      default: localPkgJson.name,
      validate: function (value: any) {
        return (typeof value === 'string' && value.length > 1) || 'Please enter a name longer than 1 character';
      }
    },
    {
      type: 'confirm',
      name: 'updateName',
      message:
        'The current package.json name does not match the api name entered. Would you the package.json name to be updated too?',
      when: function (answers: any) {
        return answers.name !== localPkgJson.name;
      }
    },
    {
      type: 'list',
      name: 'oaType',
      choices: ['Swagger 2.0', 'OpenAPI 3.0.0', 'AsyncAPI 2.0.0']
    },
    {
      type: 'confirm',
      name: 'installConfirm',
      message:
        'Press Y and enter to install. This will make a copy of the template files to ./src, an output directory ./build and a config file ./.boatsrc',
      default: false
    }
  ];
};

const validatePreInit = (): Record<string, any> => {
  if (srcAlreadyExists || buildAlreadyExists) {
    throw new Error(
      'Process stopped as ' +
      srcAlreadyExists +
      ' &/or' +
      buildPath +
      'already found. Installation cannot run with these folders existing.'
    );
  }

  if (!fs.pathExistsSync(localPkgJsonPath)) {
    throw new Error('Error: No package.json file found. Please add a package.json file to continue');
  }


  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const localPkgJson = require(localPkgJsonPath);

  localPkgJson.dependencies = {
    ...(localPkgJson.dependencies || {}),
    boats: `^${boatsPackageJson.version}`
  };

  return localPkgJson;
};

export const createBoatsrcIfNotExists = (answers?: Record<string, string>): void => {
  const boatsrcDefault: BoatsRC = {
    nunjucksOptions: {
      tags: {}
    },
    jsonSchemaRefParserBundleOpts: {},
    picomatchOptions: {
      bash: true
    },
    permissionConfig: {
      globalPrefix: true
    },
    paths: {}
  };

  if (!fs.existsSync(upath.join(pwd, '/.boatsrc'))) {
    fs.writeFileSync(upath.join(pwd, '/.boatsrc'), JSON.stringify(boatsrcDefault, null, 4));
  }
};

const copyBoilerplate = (answers: Record<string, string>) => {
  switch (answers.oaType){
    case 'Swagger 2.0':
      fs.copySync(upath.join(__dirname, '../../init-files/oa2'), srcPath);
      break;
    case 'OpenAPI 3.0.0':
      fs.copySync(upath.join(__dirname, '../../init-files/oa3'), srcPath);
      break;
    case 'AsyncAPI 2.0.0':
      fs.copySync(upath.join(__dirname, '../../init-files/asyncapi'), srcPath);
      break;
  }
  console.log('Completed: Installed boats skeleton files to ' + srcPath);

  fs.ensureDirSync(buildPath);
  console.log('Completed: Created a build output directory');
};

const updatePackageJson = (answers: Record<string, string>) => {

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const localPkgJson = require(localPkgJsonPath);

  const name = answers.name;
  if (answers.updateName) {
    localPkgJson.name = name;
  }
  localPkgJson['scripts'] = localPkgJson['scripts'] || {};
  localPkgJson['scripts']['build:json'] = 'boats -i ./src/index.yml -o ./build/${npm_package_name}.json -x -O';
  localPkgJson['scripts']['build:yaml'] = 'boats -i ./src/index.yml -o ./build/${npm_package_name}.yml -x -O';
  localPkgJson['scripts']['build'] = 'npm run build:json && npm run build:yaml -x -O';

  // ensure the licence and private field is correct in the package.json
  // we assume private by default and let the user correct otherwise.
  delete localPkgJson.license;
  localPkgJson.private = true;

  // Write the new json object to file
  fs.writeFileSync(localPkgJsonPath, JSON.stringify(localPkgJson, null, 2));
  console.log('Completed: BOATS build scripts added to your package.json');
  if (answers.updateName) {
    return console.log('Completed: Package json name attr updated');
  }
};

export const init = async (): Promise<void> => {
  try {
    const localPkgJson = validatePreInit();
    const questions = getQuestions(localPkgJson);
    const inquirer = await import('inquirer');
    const answers = await inquirer.default.prompt(questions);

    if (!answers.installConfirm) {
      return console.log('BOATS Installation cancelled.');
    }

    // write boatsrc to disc
    createBoatsrcIfNotExists(answers);
    console.log('Completed: Injected a .boatsrc file');

    copyBoilerplate(answers);

    updatePackageJson(answers);

    await npmInstall();
    console.log('Completed: Installed dependencies');
  } catch (e) {
    console.log('Aborting installation:');
    console.error(e);
  }
};
