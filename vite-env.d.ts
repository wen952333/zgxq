
interface Window {
  Telegram?: {
    WebApp?: {
      initData?: string;
      initDataUnsafe?: any;
      ready?: () => void;
      expand?: () => void;
      close?: () => void;
      openInvoice?: (url: string, callback?: (status: string) => void) => void;
      openTelegramLink?: (url: string) => void;
      showAlert?: (message: string) => void;
      [key: string]: any;
    };
  };
}

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
  }
}
