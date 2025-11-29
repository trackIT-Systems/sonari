import { createContext } from "react";

import type { AnnotationProject } from "@/types";

const AnnotationProjectContext = createContext<AnnotationProject>({
  name: "",
  description: "",
  created_on: new Date(),
  id: -1,
});

export default AnnotationProjectContext;
