import { createContext } from "react";

/**
 * The annotation project whose tag group or preset limits tag searches.
 *
 * Provided by the project detail layout; tag search bars outside a project
 * (e.g. export) see null and search all tags.
 */
const TagScopeContext = createContext<number | null>(null);

export default TagScopeContext;
