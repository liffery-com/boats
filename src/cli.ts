import fs from 'fs-extra';
import upath from 'upath';
import bundlerSwaggerParse from '@/bundlerSwaggerParse';
import commander from '@/commander';
import convertToNunjucksOrYaml from '@/convertToNunjucksOrYaml';
import Template from '@/Template';
import checkVersion from 'npm-tool-version-check';
import packageJson from '../package.json';
import GetCheckCorrectBoatsRc from '@/GetCheckCorrectBoatsRc';
import { BoatsRC } from '@/interfaces/BoatsRc';
import Snippets from '@/Snippets';
import { init } from './init';
import tmpFolderRemove from '@/tmpFolderRemove';
import { LOG_GREEN, LOG_GREEN_BOLD, LOG_RED, LOG_RED_BOLD } from '@/constants';

const dotenvFilePath = upath.join(process.cwd(), '.env');

// If a .env file exists call dotenv package to set into the env vars
if (fs.pathExistsSync(dotenvFilePath)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: dotenvFilePath });
}

// eslint-disable-next-line max-lines-per-function
const parseCli = async () => {
  const program = commander(process.argv);

  if (program.yes) {
    process.env.npm_tool_version_check__quiet = 'true';
  }

  if (!(program.noVersionCheck || process.env.NODE_ENV === 'test')) {
    await checkVersion(packageJson.version, packageJson.name, 'BOATS').catch(catchHandle);
  }

  if (program.init) {
    return await init();
  }

  // Fetch the boatsrc here and not before the init, as the init may inject a specific file based on the type initialised
  const boatsRc: BoatsRC = GetCheckCorrectBoatsRc.getBoatsConfig();

  if (program.convert_to_njk) {
    // Convert files to njk
    convertToNunjucksOrYaml(program.convert_to_njk, 'njk');
  } else if (program.convert_to_yml) {
    // Convert files to yaml
    convertToNunjucksOrYaml(program.convert_to_yml, 'yml');
  } else if (program.injectSnippet) {
    // Snippets
    new Snippets(program);
  } else {

    // parse the directory then validate and bundle with swagger-parser
    const returnFile = Template.directoryParse(
      program.input,
      program.output,
      program.indentation,
      program.strip_value,
      program.variables,
      program.functions,
      boatsRc,
      program.oneFileOutput
    );

    const pathWrittenTo = await bundlerSwaggerParse({
      inputFile: returnFile,
      outputFile: program.output,
      boatsRc,
      dereference: program.dereference,
      doNotValidate: program.dontValidateOutput,
      excludeVersion: program.exclude_version,
      indentation: program.indentation
    });

    // gracefully remove the tmp file that might have been created
    tmpFolderRemove(program.input);

    console.log(LOG_GREEN, 'Completed, the files were rendered, validated and bundled to: ');
    console.log(LOG_GREEN_BOLD, pathWrittenTo);
  }
};

const catchHandle = (error: any) => {
  const line = '----------------------';
  const printed = error.stack || error.details || error.name || undefined;
  if (error.stack) {
    console.error('');
    console.error(LOG_RED, line);
    console.error(LOG_RED_BOLD, 'ERROR.STACK: ');
    console.error(LOG_RED, line);
    console.error(LOG_RED, error.stack);
    console.error('');
    if (
      String(error.stack).includes('Cannot read property \'stack\' of undefined') ||
      String(error.stack).includes('There were errors validating the AsyncAPI document')
    ) {
      console.log(LOG_RED, 'TIP: An non-helpful error message from SwaggerParser or @asyncapi/parser is typically caused by invalid openapi or async api syntax not handled by them; it can often be invalid use of the combine keywords such as "allOf".');
    }
    console.error('');
    console.error('');
  }

  if (error.details) {
    console.error(LOG_RED, line);
    console.error(LOG_RED_BOLD, 'ERROR.DETAILS: ');
    console.error(line);
    console.error(LOG_RED, JSON.stringify(error.details, null, 2));
    console.error('');
    console.error('');
    console.error('');
  }

  if (error.name) {
    console.error(LOG_RED_BOLD, 'ERROR.NAME: ');
    console.log(LOG_RED, JSON.stringify(error.name));
  }

  console.error(LOG_RED, 'Tip: Scroll up in this terminal window for more errors and hints');

  if (printed === undefined) {
    console.trace(error);
  }

  process.exit(1);
};

parseCli().catch(catchHandle);
