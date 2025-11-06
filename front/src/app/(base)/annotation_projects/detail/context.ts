import { createContext } from "react";

import type { AnnotationProject } from "@/types";

const AnnotationProjectContext = createContext<AnnotationProject>({
  name: "",
  description: "",
  tags: [],
  created_on: new Date(),
  id: -1,
});

export default AnnotationProjectContext;
