/**
 * Production-ready logger utility
 * Only logs in development mode to reduce overhead in production
 */

const isDev = __DEV__;

export const logger = {
    log: (...args: any[]) => {
        if (isDev) console.log(...args);
    },
    warn: (...args: any[]) => {
        if (isDev) console.warn(...args);
    },
    error: (...args: any[]) => {
        // Always log errors, even in production
        console.error(...args);
    },
    info: (...args: any[]) => {
        if (isDev) console.info(...args);
    },
};


