/**
 * LSX Configuration - Type Definitions
 */

export interface LSXConfig {
    entry: string;
    output: string;
    publicDir: string;
    port: number;
    sourceMaps: boolean;
    minify: boolean;
    hotReload: boolean;
    babel?: {
        presets?: string[];
        plugins?: string[];
    };
}

export interface ConfigOptions {
    entry?: string;
    output?: string;
    publicDir?: string;
    port?: number;
    sourceMaps?: boolean;
    minify?: boolean;
    hotReload?: boolean;
}

export declare const DEFAULT_CONFIG: LSXConfig;

export declare function loadConfig(projectDir?: string): LSXConfig;
export declare function createConfig(projectDir: string, options?: ConfigOptions): void;
export declare function validateConfig(config: LSXConfig): boolean;
