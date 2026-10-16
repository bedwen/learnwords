/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
