export const $ = <T extends HTMLElement>(raiz: ParentNode, sel: string): T => raiz.querySelector(sel) as T;
