/**
 * LSX Transpiler - Type Definitions
 */

export interface TranspilerOptions {
    coreNames?: string[];
}

export interface TranspileOptions {
    filename?: string;
    sourceMaps?: boolean;
    minify?: boolean;
}

export interface TranspileResult {
    code: string;
    warnings: string[];
}

export declare class LSXTranspiler {
    constructor(options?: TranspilerOptions);
    parse(source: string, filename?: string): any;
    transpile(source: string, options?: TranspileOptions): TranspileResult;
    compile(source: string, options?: TranspileOptions): TranspileResult;
    transpileFile(inputPath: string, outputPath: string, options?: TranspileOptions): TranspileResult;
}
