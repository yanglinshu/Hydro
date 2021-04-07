import path, { sep } from 'path';
import fs from 'fs';
import { Duplex } from 'stream';
import { ObjectID } from 'bson';
import { isMoment } from 'moment';
import type { Moment } from 'moment-timezone';

declare global {
    interface StringConstructor {
        random: (digit?: number) => string;
    }
    interface String {
        format: (...args: Array<any>) => string;
        formatFromArray: (args: any[]) => string;
        rawformat: (object: any) => string;
    }
    interface ArrayConstructor {
        isDiff: (a: any[], b: any[]) => boolean;
    }
    interface Date {
        format: (fmt?: string) => string;
    }
    interface Math {
        sum: (...args: Array<number[] | number>) => number;
    }
    interface SetConstructor {
        isSuperset: (set: Set<any>, subset: Set<any>) => boolean;
        intersection: <T>(setA: Set<T>, setB: Set<T>) => Set<T>;
        union: <T>(setA: Set<T>, setB: Set<T>) => Set<T>;
    }
}

const dict = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

String.random = function random(digit = 32) {
    let str = '';
    for (let i = 1; i <= digit; i++) str += dict[Math.floor(Math.random() * 62)];
    return str;
};

String.prototype.format = function formatStr(...args) {
    let result = this;
    if (args.length > 0) {
        if (args.length === 1 && typeof (args[0]) === 'object') {
            for (const key in args) {
                if (args[key] !== undefined) {
                    const reg = new RegExp(`(\\{${key}\\})`, 'g');
                    result = result.replace(reg, args[key]);
                }
            }
        } else return this.formatFromArray(args);
    }
    return result;
};

String.prototype.formatFromArray = function formatStr(args) {
    let result = this;
    for (let i = 0; i < args.length; i++) {
        if (args[i] !== undefined) {
            const reg = new RegExp(`(\\{)${i}(\\})`, 'g');
            result = result.replace(reg, args[i]);
        }
    }
    return result;
};

String.prototype.rawformat = function rawFormat(object) {
    const res = this.split('{@}');
    return [res[0], object, res[1]].join();
};

Array.isDiff = function isDiff(a, b) {
    if (a.length !== b.length) return true;
    a.sort();
    b.sort();
    for (const i in a) {
        if (a[i] !== b[i]) return true;
    }
    return false;
};

Date.prototype.format = function formatDate(fmt = '%Y-%m-%d %H:%M:%S') {
    let m = this.getMonth() + 1;
    if (m < 10) m = `0${m}`;
    let d = this.getDate();
    if (d < 10) d = `0${d}`;
    let H = this.getHours();
    if (H < 10) H = `0${H}`;
    let M = this.getMinutes();
    if (M < 10) M = `0${M}`;
    let S = this.getSeconds();
    if (S < 10) S = `0${S}`;
    return fmt
        .replace('%Y', this.getFullYear())
        .replace('%m', m)
        .replace('%d', d)
        .replace('%H', H)
        .replace('%M', M)
        .replace('%S', S);
};

Math.sum = function sum(...args) {
    let s = 0;
    for (const i of args) {
        if (i instanceof Array) {
            for (const j of i) {
                s += j;
            }
        } else s += i;
    }
    return s;
};

Set.isSuperset = function isSuperset(set, subset) {
    for (const elem of subset) {
        if (!set.has(elem)) return false;
    }
    return true;
};

Set.union = function Union<T>(setA: Set<T>, setB: Set<T>) {
    const union = new Set(setA);
    for (const elem of setB) union.add(elem);
    return union;
};

Set.intersection = function Intersection<T>(setA: Set<T>, setB: Set<T>): Set<T> {
    const intersection = new Set();
    for (const elem of setB) {
        if (setA.has(elem)) intersection.add(elem);
    }
    // @ts-ignore
    return intersection;
};

export function folderSize(folderPath: string) {
    // eslint-disable-next-line @typescript-eslint/no-shadow
    let size = 0;
    const _next = function a(p: string) {
        if (p) {
            const stats = fs.statSync(p);
            if (!stats.isDirectory() || stats.isSymbolicLink()) {
                if (!stats.isSymbolicLink()) size += stats.size;
            } else {
                size += stats.size;
                const files = fs.readdirSync(p);
                if (Array.isArray(files)) {
                    files.forEach((file) => {
                        _next(path.join(p, file));
                    });
                }
            }
        }
    };
    _next(folderPath);
    return size;
}

const TIME_RE = /^([0-9]+(?:\.[0-9]*)?)([mu]?)s?$/i;
const TIME_UNITS = { '': 1000, m: 1, u: 0.001 };
const MEMORY_RE = /^([0-9]+(?:\.[0-9]*)?)([kmg])b?$/i;
const MEMORY_UNITS = { k: 1 / 1024, m: 1, g: 1024 };

export function parseTimeMS(str: string) {
    const match = TIME_RE.exec(str);
    if (!match) throw new Error(`${str} error parsing time`);
    return Math.floor(parseFloat(match[1]) * TIME_UNITS[match[2]]);
}

export function parseMemoryMB(str: string) {
    const match = MEMORY_RE.exec(str);
    if (!match) throw new Error(`${str} error parsing memory`);
    return Math.ceil(parseFloat(match[1]) * MEMORY_UNITS[match[2]]);
}

export function isClass(obj: any, strict = false) {
    if (typeof obj !== 'function') return false;
    const str = obj.toString();
    if (obj.prototype === undefined) return false;
    if (obj.prototype.constructor !== obj) return false;
    if (str.slice(0, 5) === 'class') return true;
    if (Object.getOwnPropertyNames(obj.prototype).length >= 2) return true;
    if (/^function\s+\(|^function\s+anonymous\(/.test(str)) return false;
    if (strict && /^function\s+[A-Z]/.test(str)) return true;
    if (/\b\(this\b|\bthis[.[]\b/.test(str)) {
        if (!strict || /classCallCheck\(this/.test(str)) return true;
        return /^function\sdefault_\d+\s*\(/.test(str);
    }
    return false;
}

export function streamToBuffer(stream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const buffers = [];
        stream.on('error', reject);
        stream.on('data', (data) => buffers.push(data));
        stream.on('end', () => resolve(Buffer.concat(buffers)));
    });
}

export function bufferToStream(buffer: Buffer): NodeJS.ReadableStream {
    const stream = new Duplex();
    stream.push(buffer);
    stream.push(null);
    return stream;
}

export function sleep(timeout: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });
}

function deepen(modifyString: (source: string) => string) {
    function modifyObject<T>(source: T): T {
        if (typeof source !== 'object' || !source) return source;
        if (Array.isArray(source)) return source.map(modifyObject) as any;
        const result = {} as T;
        for (const key in source) {
            result[modifyString(key)] = modifyObject(source[key]);
        }
        return result;
    }

    return function t<T>(source: T): T {
        if (typeof source === 'string') return modifyString(source) as any;
        return modifyObject(source);
    };
}

export function noop() { }

export const camelCase = deepen((source) => source.replace(/[_-][a-z]/g, (str) => str.slice(1).toUpperCase()));
export const paramCase = deepen((source) => source.replace(/_/g, '-').replace(/(?<!^)[A-Z]/g, (str) => `-${str.toLowerCase()}`));
export const snakeCase = deepen((source) => source.replace(/-/g, '_').replace(/(?<!^)[A-Z]/g, (str) => `_${str.toLowerCase()}`));

export namespace Time {
    export const second = 1000;
    export const minute = second * 60;
    export const hour = minute * 60;
    export const day = hour * 24;
    export const week = day * 7;
    export function formatTimeShort(ms: number) {
        const abs = Math.abs(ms);
        if (abs >= day - hour / 2) return `${Math.round(ms / day)}d`;
        if (abs >= hour - minute / 2) return `${Math.round(ms / hour)}h`;
        if (abs >= minute - second / 2) return `${Math.round(ms / minute)}m`;
        if (abs >= second) return `${Math.round(ms / second)}s`;
        return `${ms}ms`;
    }

    export function getObjectID(timestamp: string | Date | Moment) {
        let _timestamp: number;
        if (typeof timestamp === 'string') _timestamp = new Date(timestamp).getTime();
        else if (isMoment(timestamp)) _timestamp = timestamp.toDate().getTime();
        else _timestamp = timestamp.getTime();
        const hexSeconds = Math.floor(_timestamp / 1000).toString(16);
        const constructedObjectId = new ObjectID(`${hexSeconds}0000000000000000`);
        return constructedObjectId;
    }
}

export function errorMessage(err: Error | string) {
    const t = typeof err === 'string' ? err : err.stack;
    const q = t.split('\n');
    for (let i = 0; i < q.length; i++) {
        if (!q[i].startsWith('    at')) continue;
        if (q[i].includes(`${sep}@hydrooj${sep}`)) q[i] = q[i].split(`@hydrooj${sep}`)[1];
        else if (q[i].includes(`${sep}hydrooj${sep}`)) q[i] = `    at hydrooj${sep}${q[i].split(`hydrooj${sep}`)[1]}`;
    }
    if (typeof err === 'string') return q.join('\n');
    err.stack = q.join('\n');
    return err;
}

export function size(s: number, base = 1) {
    s *= base;
    const unit = 1024;
    const unitNames = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    for (const unitName of unitNames) {
        if (s < unit) return '{0} {1}'.format(Math.round(s * 10) / 10, unitName);
        s /= unit;
    }
    return `${Math.round(s * unit)} ${unitNames[unitNames.length - 1]}`;
}

function _digit2(number: number) {
    return number < 10 ? `0${number}` : number.toString();
}

export function formatSeconds(_seconds = '0') {
    const seconds = parseInt(_seconds, 10);
    return '{0}:{1}:{2}'.format(
        _digit2(Math.floor(seconds / 3600)),
        _digit2(Math.floor((seconds % 3600) / 60)),
        _digit2(seconds % 60),
    );
}
