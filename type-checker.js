'use strict';

/**
 * LSX Type Checker
 *
 * Simple type checking for optional type annotations in LSX.
 * This provides basic type safety without requiring full TypeScript integration.
 */

class TypeChecker {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.types = new Map();
        this.declared = new Map();
    }

    /**
     * Check types in an AST
     */
    check(program) {
        this.errors = [];
        this.warnings = [];

        // Collect type declarations
        this.collectTypes(program);

        // Check the program
        this.checkProgram(program);

        return { errors: this.errors, warnings: this.warnings };
    }

    collectTypes(program) {
        program.body.forEach((node) => {
            if (node.type === 'ComponentDeclaration') {
                // Collect prop types
                node.props.forEach((prop) => {
                    if (prop.typeAnnotation) {
                        this.types.set(prop.name, prop.typeAnnotation);
                    }
                });
            }
        });
    }

    checkProgram(program) {
        program.body.forEach((node) => {
            this.checkNode(node);
        });
    }

    checkNode(node, scope = new Map()) {
        if (!node) return;

        switch (node.type) {
            case 'ComponentDeclaration':
                this.checkComponent(node, scope);
                break;
            case 'FunctionDeclaration':
                this.checkFunction(node, scope);
                break;
            case 'VariableDeclaration':
                this.checkVariableDeclaration(node, scope);
                break;
            case 'AssignmentExpression':
                this.checkAssignment(node, scope);
                break;
            case 'CallExpression':
                this.checkCall(node, scope);
                break;
            case 'ReturnStatement':
                if (node.argument) this.checkNode(node.argument, scope);
                break;
            case 'IfStatement':
                this.checkNode(node.test, scope);
                this.checkNode(node.consequent, scope);
                if (node.alternate) this.checkNode(node.alternate, scope);
                break;
            case 'BlockStatement':
                node.body.forEach((s) => this.checkNode(s, scope));
                break;
            default:
                // Recursively check other nodes
                if (node.type) {
                    Object.keys(node).forEach((key) => {
                        if (key !== 'type' && key !== 'loc' && typeof node[key] === 'object') {
                            this.checkNode(node[key], scope);
                        }
                    });
                }
        }
    }

    checkComponent(comp, scope) {
        // Check props
        comp.props.forEach((prop) => {
            this.declared.set(prop.name, prop.typeAnnotation || 'any');
        });

        // Check state
        comp.state.forEach((state) => {
            this.declared.set(state.name, state.typeAnnotation || 'any');
        });

        // Check methods
        comp.methods.forEach((method) => {
            this.checkMethod(method, scope);
        });

        // Check render
        if (comp.render) {
            this.checkNode(comp.render, scope);
        }
    }

    checkFunction(fn, scope) {
        fn.params.forEach((param) => {
            if (param.type === 'Identifier') {
                this.declared.set(param.name, param.typeAnnotation || 'any');
            }
        });
        this.checkNode(fn.body, scope);
    }

    checkMethod(method, scope) {
        method.params.forEach((param) => {
            if (param.type === 'Identifier') {
                this.declared.set(param.name, param.typeAnnotation || 'any');
            }
        });
        this.checkNode(method.body, scope);
    }

    checkVariableDeclaration(decl, scope) {
        decl.declarations.forEach((d) => {
            if (d.init) {
                const initType = this.inferType(d.init);
                const declaredType = d.id.typeAnnotation || 'any';

                if (declaredType !== 'any' && initType !== 'any' && !this.isCompatible(initType, declaredType)) {
                    this.errors.push({
                        message: `Type mismatch: cannot assign ${initType} to ${declaredType}`,
                        location: d.id.loc
                    });
                }

                this.declared.set(d.id.name, declaredType);
            }
        });
    }

    checkAssignment(assign, scope) {
        if (assign.left.type === 'Identifier') {
            const varName = assign.left.name;
            const declaredType = this.declared.get(varName) || 'any';
            const rightType = this.inferType(assign.right);

            if (declaredType !== 'any' && rightType !== 'any' && !this.isCompatible(rightType, declaredType)) {
                this.errors.push({
                    message: `Type mismatch: cannot assign ${rightType} to ${declaredType}`,
                    location: assign.left.loc
                });
            }
        }
    }

    checkCall(call, scope) {
        // Basic call checking - could be expanded
        this.checkNode(call.callee, scope);
        call.arguments.forEach((arg) => this.checkNode(arg, scope));
    }

    inferType(node) {
        if (!node) return 'any';

        switch (node.type) {
            case 'Literal':
                if (node.kind === 'string') return 'string';
                if (node.kind === 'number') return 'number';
                if (node.kind === 'boolean') return 'boolean';
                if (node.kind === 'null') return 'null';
                return 'any';
            case 'Identifier':
                return this.declared.get(node.name) || 'any';
            case 'ArrayExpression':
                return 'array';
            case 'ObjectExpression':
                return 'object';
            case 'BinaryExpression':
                // For binary ops, infer based on operator
                if (['+', '-', '*', '/', '%'].includes(node.operator)) return 'number';
                if (['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(node.operator)) return 'boolean';
                return 'any';
            case 'CallExpression':
                // Try to infer from known functions
                if (node.callee.type === 'Identifier') {
                    if (node.callee.name === 'useState') return 'array';
                    if (node.callee.name === 'useEffect') return 'void';
                }
                return 'any';
            default:
                return 'any';
        }
    }

    isCompatible(inferred, declared) {
        // Simple compatibility check
        if (inferred === declared) return true;
        if (declared === 'any') return true;
        if (inferred === 'any') return true;

        // Numeric compatibility
        if (declared === 'number' && inferred === 'number') return true;

        return false;
    }
}

module.exports = TypeChecker;
