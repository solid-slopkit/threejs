import { createContext } from 'solid-js';

/**
 * The Instance that the Scene components inside it attach to, as an accessor: a Rebuild replaces it, and the children
 * move to the new one. A Canvas provides its scene. Internal.
 */
export const ParentContext = createContext<() => object>();
