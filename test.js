'use strict';

/**
 * LSX Transpiler Tests
 *
 * Comprehensive test suite for the LSX transpiler
 */

const LSXTranspiler = require('./transpiler');
const assert = require('assert');

class TestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('Running LSX Transpiler Tests...\n');

        for (const test of this.tests) {
            try {
                await test.fn();
                console.log(`✅ ${test.name}`);
                this.passed++;
            } catch (err) {
                console.log(`❌ ${test.name}`);
                console.log(`   ${err.message}`);
                this.failed++;
            }
        }

        console.log(`\n${this.passed} passed, ${this.failed} failed`);
        process.exit(this.failed > 0 ? 1 : 0);
    }
}

const runner = new TestRunner();

// Test 1: Basic component
runner.test('Basic component transpilation', () => {
    const source = `
component App {
    render {
        return <div>Hello</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code, warnings } = transpiler.transpile(source);

    assert(code.includes('const App = () =>'), 'Should create arrow function');
    assert(code.includes('return <div>Hello</div>'), 'Should return JSX');
    assert(warnings.length === 0, 'Should have no warnings');
});

// Test 2: Component with props
runner.test('Component with props', () => {
    const source = `
component Greeting {
    props {
        name
    }

    render {
        return <div>Hello, {name}!</div>
    }
}

export default Greeting
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('const Greeting = ({ name }) =>'), 'Should destructure props');
    assert(code.includes('Hello, {name}'), 'Should use props in JSX');
});

// Test 3: Component with state
runner.test('Component with state', () => {
    const source = `
component Counter {
    state {
        count = 0
    }

    render {
        return <div>Count: {count}</div>
    }
}

export default Counter
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('useState'), 'Should import useState');
    assert(code.includes('const [count, setCount] = useState(0)'), 'Should create state');
});

// Test 4: Component with methods
runner.test('Component with methods', () => {
    const source = `
component Button {
    props {
        onClick
    }

    render {
        return <button onClick={handleClick}>Click me</button>
    }

    handleClick() {
        onClick()
    }
}

export default Button
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('const handleClick = () =>'), 'Should create method as arrow function');
});

// Test 5: Component with effects
runner.test('Component with effects', () => {
    const source = `
component Timer {
    state {
        seconds = 0
    }

    effect init() {
        setInterval(() => {
            seconds = seconds + 1
        }, 1000)
    }

    render {
        return <div>{seconds}s</div>
    }
}

export default Timer
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('useEffect'), 'Should import useEffect');
    assert(code.includes('useEffect(() => {'), 'Should create effect');
});

// Test 6: Component with style blocks
runner.test('Component with style blocks', () => {
    const source = `
component StyledCard {
    style {
        card {
            padding: 20px;
            background: white;
        }
    }

    render {
        return <div style={styles.card}>Hello</div>
    }
}

export default StyledCard
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('const styles = {'), 'Should create styles object');
    assert(code.includes('padding'), 'Should include padding style');
    assert(code.includes('background'), 'Should include background style');
});

// Test 7: Import statements
runner.test('Import statements', () => {
    const source = `
import { Header, Footer } from '@lsx/core'

component App {
    render {
        return <Header />
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes("import { Header, Footer } from '@lsx/core'"), 'Should preserve imports');
});

// Test 8: Auto-import React
runner.test('Auto-import React when JSX is used', () => {
    const source = `
component App {
    render {
        return <div>Hello</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes("import React from 'react'"), 'Should auto-import React');
});

// Test 9: Auto-import useState when state is used
runner.test('Auto-import useState when state is used', () => {
    const source = `
component Counter {
    state {
        count = 0
    }

    render {
        return <div>{count}</div>
    }
}

export default Counter
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('useState'), 'Should include useState in imports');
});

// Test 10: Auto-import useEffect when effects are used
runner.test('Auto-import useEffect when effects are used', () => {
    const source = `
component Component {
    effect init() {
        console.log('init')
    }

    render {
        return <div>Test</div>
    }
}

export default Component
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('useEffect'), 'Should include useEffect in imports');
});

// Test 11: State assignment transformation
runner.test('State assignment transformation', () => {
    const source = `
component Counter {
    state {
        count = 0
    }

    render {
        return <div>{count}</div>
    }

    increment() {
        count = count + 1
    }
}

export default Counter
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('setCount(count + 1)'), 'Should transform count assignment to setCount');
});

// Test 12: Nested JSX
runner.test('Nested JSX', () => {
    const source = `
component App {
    render {
        return <div>
            <h1>Title</h1>
            <p>Content</p>
        </div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('<h1>Title</h1>'), 'Should preserve nested JSX');
    assert(code.includes('<p>Content</p>'), 'Should preserve nested JSX');
});

// Test 13: JSX attributes
runner.test('JSX attributes', () => {
    const source = `
component App {
    render {
        return <div className="container" id="main">Hello</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('className="container"'), 'Should preserve className attribute');
    assert(code.includes('id="main"'), 'Should preserve id attribute');
});

// Test 14: JSX expression containers
runner.test('JSX expression containers', () => {
    const source = `
component App {
    props {
        name
    }

    render {
        return <div>Hello, {name}!</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('{name}'), 'Should preserve expression containers');
});

// Test 15: Function declarations
runner.test('Function declarations', () => {
    const source = `
fn greet(name) {
    return "Hello, " + name
}

component App {
    render {
        return <div>{greet("World")}</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('function greet(name)'), 'Should preserve function declaration');
});

// Test 16: Variable declarations
runner.test('Variable declarations', () => {
    const source = `
component App {
    render {
        const message = "Hello"
        return <div>{message}</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('const message = "Hello"'), 'Should preserve variable declarations');
});

// Test 17: If statements
runner.test('If statements', () => {
    const source = `
component App {
    props {
        show
    }

    render {
        if (show) {
            return <div>Visible</div>
        }
        return <div>Hidden</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('if (show)'), 'Should preserve if statement');
});

// Test 18: For loops
runner.test('For loops', () => {
    const source = `
component App {
    render {
        const items = [1, 2, 3]
        for (const item of items) {
            console.log(item)
        }
        return <div>Test</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('for (const item of items)'), 'Should preserve for-of loop');
});

// Test 19: Arrow functions
runner.test('Arrow functions', () => {
    const source = `
component App {
    render {
        const add = (a, b) => a + b
        return <div>{add(1, 2)}</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('const add = (a, b) => a + b'), 'Should preserve arrow function');
});

// Test 20: JSX compilation with Babel
runner.test('JSX compilation with Babel', () => {
    const source = `
component App {
    render {
        return <div>Hello</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.compile(source);

    assert(code.includes('React.createElement'), 'Should compile JSX to React.createElement');
});

// Test 21: Async methods
runner.test('Async methods', () => {
    const source = `
component App {
    state {
        data = null
    }

    render {
        return <div>{data}</div>
    }

    async fetchData() {
        data = await fetch('/api/data')
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(code.includes('const fetchData = async () =>'), 'Should create async method');
    assert(code.includes('await'), 'Should preserve await keyword');
});

// Test 22: Style block with hyphenated properties
runner.test('Style blocks with hyphenated properties', () => {
    const source = `
component Card {
    style {
        card {
            padding: 20px
            border-radius: 8px
            background: white
        }
    }

    render {
        return <div style={styles.card}>hi</div>
    }
}

export default Card
`;

    const transpiler = new LSXTranspiler();
    const { code, warnings } = transpiler.transpile(source);

    assert(code.includes('borderRadius: "8px"'), 'Should camelCase the JS style key');
    assert(code.includes('border-radius: 8px;'), 'Should keep kebab-case in the CSS string');
    assert(code.includes('card: "padding: 20px;'), 'Should emit a valid CSS rule string');
    assert(warnings.length === 0, 'Should have no warnings');
});

// Test 23: cleanup nested inside an effect body
runner.test('Nested effect cleanup', () => {
    const source = `
component Timer {
    state {
        seconds = 0
    }

    effect init() {
        interval = setInterval(tick, 1000)
        cleanup() {
            clearInterval(interval)
        }
    }

    tick() {
        seconds = seconds + 1
    }

    render {
        return <div>{seconds}</div>
    }
}

export default Timer
`;

    const transpiler = new LSXTranspiler();
    const { code, warnings } = transpiler.transpile(source);

    assert(code.includes('return () => {'), 'Should return a cleanup function');
    assert(code.includes('clearInterval(interval)'), 'Should emit the cleanup body');
    assert(!code.includes('CleanupDeclaration'), 'Should not emit the AST node name');
    assert(warnings.length === 0, 'Should have no warnings: ' + warnings.join(', '));
});

// Test 24: hooks are imported from the AST, not from emission order
runner.test('Imports hooks used by state and effects', () => {
    const source = `
component App {
    state {
        count = 0
    }

    effect init() {
        console.log(count)
    }

    render {
        return <div>{count}</div>
    }
}

export default App
`;

    const transpiler = new LSXTranspiler();
    const { code } = transpiler.transpile(source);

    assert(/import React, \{ useState, useEffect \} from 'react';/.test(code),
        'Should import React, useState and useEffect: ' + code.split('\n')[1]);
});

// Run all tests
runner.run();
