/**
 * @lsx/core - Type Definitions
 *
 * TypeScript definitions for LSX core components
 */

import * as React from 'react';

export interface PageProps {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export interface HeaderProps {
    title?: string;
    subtitle?: string;
    className?: string;
    style?: React.CSSProperties;
}

export interface FooterProps {
    copyright?: string;
    className?: string;
    style?: React.CSSProperties;
}

export interface SectionProps {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export interface BodyProps {
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export type ButtonVariant = 'primary' | 'secondary' | 'outline';

export interface ButtonProps {
    children?: React.ReactNode;
    onClick?: () => void;
    variant?: ButtonVariant;
    disabled?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

export interface CardProps {
    children?: React.ReactNode;
    title?: string;
    className?: string;
    style?: React.CSSProperties;
}

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export interface GridProps {
    children?: React.ReactNode;
    columns?: number;
    gap?: string;
    className?: string;
    style?: React.CSSProperties;
}

export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';
export type FlexJustify = 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
export type FlexAlign = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';

export interface FlexProps {
    children?: React.ReactNode;
    direction?: FlexDirection;
    justify?: FlexJustify;
    align?: FlexAlign;
    gap?: string;
    className?: string;
    style?: React.CSSProperties;
}

export interface InputProps {
    type?: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    className?: string;
    style?: React.CSSProperties;
}

export interface RouterProps {
    routes: Record<string, React.ComponentType<any>>;
    defaultRoute?: string;
}

export interface LinkProps {
    to: string;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export interface FetchOptions {
    headers?: Record<string, string>;
    [key: string]: any;
}

export declare const Page: React.FC<PageProps>;
export declare const Header: React.FC<HeaderProps>;
export declare const Footer: React.FC<FooterProps>;
export declare const Section: React.FC<SectionProps>;
export declare const Body: React.FC<BodyProps>;
export declare const Button: React.FC<ButtonProps>;
export declare const Card: React.FC<CardProps>;
export declare const Modal: React.FC<ModalProps>;
export declare const Grid: React.FC<GridProps>;
export declare const Flex: React.FC<FlexProps>;
export declare const Input: React.FC<InputProps>;
export declare const Router: React.FC<RouterProps>;
export declare const Link: React.FC<LinkProps>;

// API helpers
export declare function get<T = any>(url: string, options?: FetchOptions): Promise<T>;
export declare function post<T = any>(url: string, data: any, options?: FetchOptions): Promise<T>;
export declare function put<T = any>(url: string, data: any, options?: FetchOptions): Promise<T>;
export declare function del<T = any>(url: string, options?: FetchOptions): Promise<T>;
