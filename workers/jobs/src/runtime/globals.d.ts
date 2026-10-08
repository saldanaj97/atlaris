// App modules detect a browser with `typeof window !== 'undefined'`. workerd
// has no `window`; declare it so those checks typecheck without the DOM lib.
declare const window: undefined;
