'use strict';

/**
 * @lsx/core - Core Layout Components
 *
 * This package provides the fundamental layout components used in LSX applications.
 * All components are designed to be simple, flexible, and customizable.
 */

const React = require('react');
const { useState, useEffect } = React;

/**
 * Page Component
 * Wraps the entire page layout with a container
 */
function Page({ children, className = '', style = {} }) {
    return React.createElement('div', {
        className: `lsx-page ${className}`,
        style: {
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            ...style
        }
    }, children);
}

/**
 * Header Component
 * Top section of the page with title and subtitle
 */
function Header({ title, subtitle, className = '', style = {} }) {
    return React.createElement('header', {
        className: `lsx-header ${className}`,
        style: {
            padding: '2rem',
            backgroundColor: '#f8f9fa',
            borderBottom: '1px solid #e9ecef',
            ...style
        }
    }, [
        title && React.createElement('h1', {
            key: 'title',
            style: { margin: 0, fontSize: '2rem', color: '#212529' }
        }, title),
        subtitle && React.createElement('p', {
            key: 'subtitle',
            style: { margin: '0.5rem 0 0 0', fontSize: '1.1rem', color: '#6c757d' }
        }, subtitle)
    ].filter(Boolean));
}

/**
 * Footer Component
 * Bottom section of the page with copyright info
 */
function Footer({ copyright, className = '', style = {} }) {
    return React.createElement('footer', {
        className: `lsx-footer ${className}`,
        style: {
            padding: '1.5rem',
            backgroundColor: '#f8f9fa',
            borderTop: '1px solid #e9ecef',
            marginTop: 'auto',
            textAlign: 'center',
            color: '#6c757d',
            ...style
        }
    }, copyright || `© ${new Date().getFullYear()} LSX`);
}

/**
 * Section Component
 * A section container for grouping content
 */
function Section({ children, className = '', style = {} }) {
    return React.createElement('section', {
        className: `lsx-section ${className}`,
        style: {
            padding: '2rem',
            maxWidth: '1200px',
            margin: '0 auto',
            ...style
        }
    }, children);
}

/**
 * Body Component
 * Main content container within a section
 */
function Body({ children, className = '', style = {} }) {
    return React.createElement('div', {
        className: `lsx-body ${className}`,
        style: {
            ...style
        }
    }, children);
}

/**
 * Button Component
 * A clickable button with default styling
 */
function Button({ children, onClick, variant = 'primary', disabled = false, className = '', style = {} }) {
    const variantStyles = {
        primary: {
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none'
        },
        secondary: {
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none'
        },
        outline: {
            backgroundColor: 'transparent',
            color: '#007bff',
            border: '1px solid #007bff'
        }
    };

    return React.createElement('button', {
        className: `lsx-button lsx-button-${variant} ${className}`,
        onClick,
        disabled,
        style: {
            padding: '0.5rem 1.5rem',
            fontSize: '1rem',
            borderRadius: '0.25rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            ...variantStyles[variant],
            ...style
        }
    }, children);
}

/**
 * Card Component
 * A container with a border and shadow for content
 */
function Card({ children, title, className = '', style = {} }) {
    return React.createElement('div', {
        className: `lsx-card ${className}`,
        style: {
            border: '1px solid #e9ecef',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            backgroundColor: 'white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            ...style
        }
    }, [
        title && React.createElement('h3', {
            key: 'title',
            style: { marginTop: 0, marginBottom: '1rem', color: '#212529' }
        }, title),
        children
    ].filter(Boolean));
}

/**
 * Modal Component
 * A dialog that appears on top of the page content
 */
function Modal({ isOpen, onClose, title, children, className = '', style = {} }) {
    if (!isOpen) return null;

    return React.createElement('div', {
        className: `lsx-modal-overlay ${className}`,
        style: {
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            ...style
        },
        onClick: onClose
    }, React.createElement('div', {
        className: 'lsx-modal-content',
        style: {
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        },
        onClick: (e) => e.stopPropagation()
    }, [
        title && React.createElement('h2', {
            key: 'title',
            style: { marginTop: 0, marginBottom: '1rem' }
        }, title),
        children,
        React.createElement('button', {
            key: 'close',
            onClick: onClose,
            style: {
                marginTop: '1.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer'
            }
        }, 'Close')
    ].filter(Boolean)));
}

/**
 * Grid Component
 * A CSS Grid layout container
 */
function Grid({ children, columns = 1, gap = '1rem', className = '', style = {} }) {
    return React.createElement('div', {
        className: `lsx-grid ${className}`,
        style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap,
            ...style
        }
    }, children);
}

/**
 * Flex Component
 * A Flexbox layout container
 */
function Flex({ children, direction = 'row', justify = 'flex-start', align = 'flex-start', gap = '1rem', className = '', style = {} }) {
    return React.createElement('div', {
        className: `lsx-flex ${className}`,
        style: {
            display: 'flex',
            flexDirection: direction,
            justifyContent: justify,
            alignItems: align,
            gap,
            ...style
        }
    }, children);
}

/**
 * Input Component
 * A text input field
 */
function Input({ type = 'text', placeholder, value, onChange, className = '', style = {} }) {
    return React.createElement('input', {
        type,
        placeholder,
        value,
        onChange,
        className: `lsx-input ${className}`,
        style: {
            padding: '0.5rem',
            border: '1px solid #ced4da',
            borderRadius: '0.25rem',
            fontSize: '1rem',
            ...style
        }
    });
}

/**
 * Router Component
 * Simple hash-based routing
 */
function Router({ routes, defaultRoute = '/' }) {
    const [currentPath, setCurrentPath] = useState(window.location.hash.slice(1) || defaultRoute);

    useEffect(() => {
        const handleHashChange = () => {
            setCurrentPath(window.location.hash.slice(1) || defaultRoute);
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [defaultRoute]);

    const navigate = (path) => {
        window.location.hash = path;
    };

    const RouteComponent = routes[currentPath] || routes[defaultRoute] || (() => React.createElement('div', null, '404 - Not Found'));

    return React.createElement(RouteComponent, { navigate, currentPath });
}

/**
 * Link Component
 * Navigation link for hash-based routing
 */
function Link({ to, children, className = '', style = {} }) {
    const handleClick = (e) => {
        e.preventDefault();
        window.location.hash = to;
    };

    return React.createElement('a', {
        href: `#${to}`,
        onClick: handleClick,
        className: `lsx-link ${className}`,
        style: {
            color: '#007bff',
            textDecoration: 'none',
            cursor: 'pointer',
            ...style
        }
    }, children);
}

/**
 * API Helper Functions
 * Simple wrappers around fetch for common API operations
 */

/**
 * Perform a GET request
 */
async function get(url, options = {}) {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
}

/**
 * Perform a POST request
 */
async function post(url, data, options = {}) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        body: JSON.stringify(data),
        ...options
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
}

/**
 * Perform a PUT request
 */
async function put(url, data, options = {}) {
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        body: JSON.stringify(data),
        ...options
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
}

/**
 * Perform a DELETE request
 */
async function del(url, options = {}) {
    const response = await fetch(url, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
}

// Export all components and helpers
module.exports = {
    Page,
    Header,
    Footer,
    Section,
    Body,
    Button,
    Card,
    Modal,
    Grid,
    Flex,
    Input,
    Router,
    Link,
    // API helpers
    get,
    post,
    put,
    del
};
