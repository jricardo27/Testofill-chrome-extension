import fs from 'fs';
import { expect } from 'chai';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Assuming run from project root, or adjusting path relative to this test file.
// this file is in test/placeholders_test.js
// target is src/extension/content/testofill-run.js
const targetPath = path.resolve(__dirname, '../src/extension/content/testofill-run.js');

const code = fs.readFileSync(targetPath, 'utf8');

const sandbox = {
    console: console,
    _: {
        isUndefined: (v) => v === undefined,
        extend: (o, s) => Object.assign(o, s),
    },
    Sizzle: () => [],
    document: { location: { toString: () => "http://test" }, querySelector: () => null },
    window: {},
    Date: Date,
    Math: Math,
    setTimeout: setTimeout,
    chrome: {
        runtime: {
            onMessage: { hasListeners: () => false, addListener: () => { } },
            sendMessage: () => { }
        }
    }
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const { processPlaceholders } = sandbox;

describe('Placeholder Processing', function () {
    it('should not change string without placeholders', function () {
        expect(processPlaceholders("hello")).to.equal("hello");
    });

    it('should replace {timestamp}', function () {
        const val = processPlaceholders("user{timestamp}");
        expect(val).to.match(/^user\d+$/);
    });

    it('should replace {random4}', function () {
        const val = processPlaceholders("user-{random4}");
        expect(val).to.match(/^user-\d{4}$/);
    });

    it('should replace {random6}', function () {
        const val = processPlaceholders("user-{random6}");
        expect(val).to.match(/^user-\d{6}$/);
    });
});
