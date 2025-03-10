import { IoMem } from './io-mem.ts';

/**
 * The example function demonstrates how the package works
 */
export const example = () => {
  const print = console.log;

  const ioMem = new IoMem();
  print(ioMem.foo);
};
