import { ProcessApplications } from './lib/index.js';

import fs from 'fs';
import path from 'path';

const processApplications = new ProcessApplications(console);

// listen on <ready>
processApplications.on('ready', () => {
  console.log('Process applications is ready!');

  // console.log('items', JSON.stringify(processApplications._indexer.getItems(), null, 2));

  fs.writeFileSync('test.json', JSON.stringify(processApplications._indexer.getItems(), null, 2));

  // find references to DMN decision with ID 'foo'
  console.log('references to DMN decision with ID \'foo\'', processApplications.findReferences({
    type: 'dmn',
    id: 'foo'
  }));

  // get completions for DMN decision ID starting with 'fo'
  console.log('completions for DMN decision ID starting with \'fo\'', processApplications.getCompletions({
    type: 'dmn',
    value: 'fo'
  }));
});

// intialize
processApplications.init({ watch: true });

// add a search root
processApplications.addRoot(`file://${ path.resolve('customer-onboarding') }`);

// // find references at position
// const refs = processApplications.findReferences({
//   uri: 'file:///some-folder/foo.md',
//   position: {
//     start: { line: 1, column: 5 },
//     end: { line: 1, column: 5 }
//   }
// });

// // find definitions at document position
// const defs = processApplications.findDefinitions({
//   uri: 'file:///some-folder/foo.md',
//   position: {
//     start: { line: 1, column: 5 },
//     end: { line: 1, column: 5 }
//   }
// });