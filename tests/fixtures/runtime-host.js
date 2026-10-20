import {createExtensionRuntime as createRuntime} from '../../src/extension-runtime.js';
export function createExtensionRuntime(options={}) {
 let generation=0;
 return createRuntime({onRequestOpen(){const token=++generation;return Object.freeze({isCurrent:()=>token===generation});},...options});
}
