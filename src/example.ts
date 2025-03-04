import { Foo } from './foo.ts';


/**
 * The example function demonstrates how the package works
 */
export const example = () => {
  const print = console.log;
  const assert = console.assert;

  const foo = new Foo();
  print(foo.foo());
  assert(foo.foo() === 'bar');
};

export class X {}
