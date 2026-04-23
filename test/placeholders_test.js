import fs from 'fs';
import chai from 'chai';
const { expect } = chai;
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
        debounce: (fn) => fn,
    },
    Sizzle: () => [],
    MutationObserver: class { observe() {} disconnect() {} },
    InputEvent: class {},
    Event: class {},
    KeyboardEvent: class {},
    MouseEvent: class {},
    document: { 
        location: { toString: () => "http://test" }, 
        querySelector: () => null,
        getElementById: () => null,
        createElement: () => ({ innerText: "", style: {} }),
        head: { appendChild: () => {} },
        body: { appendChild: () => {} }
    },
    window: {
        matchMedia: () => ({ 
            matches: false,
            addEventListener: () => {},
            removeEventListener: () => {}
        })
    },
    Date: Date,
    Math: Math,
    setInterval: setInterval,
    chance: {
        first: () => "John",
        last: () => "Doe",
        name: () => "John Doe",
        word: () => "Example",
        city: () => "New York",
        state: () => "NY",
        zip: () => "12345"
    },
    setTimeout: setTimeout,
    chrome: {
        runtime: {
            onMessage: { hasListeners: () => false, addListener: () => { } },
            sendMessage: () => { }
        },
        storage: {
            onChanged: { addListener: () => {} },
            local: { get: () => Promise.resolve({}), set: () => Promise.resolve({}) }
        }
    }
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const { processPlaceholders } = sandbox;

describe('Placeholder Processing', function () {
    it('should not change string without placeholders', async function () {
        expect(await processPlaceholders("hello")).to.equal("hello");
    });

    it('should replace {timestamp}', async function () {
        const val = await processPlaceholders("user{timestamp}");
        expect(val).to.match(/^user\d+$/);
    });

    it('should replace {random4}', async function () {
        const val = await processPlaceholders("user-{random4}");
        expect(val).to.match(/^user-\d{4}$/);
    });

    it('should replace {random6}', async function () {
        const val = await processPlaceholders("user-{random6}");
        expect(val).to.match(/^user-\d{6}$/);
    });

    it('should replace {random1}', async function () {
        const val = await processPlaceholders("{random1}");
        expect(val).to.match(/^\d$/);
    });

    it('should replace {random2}', async function () {
        const val = await processPlaceholders("{random2}");
        expect(val).to.match(/^\d{2}$/);
    });

    it('should respect exclusions in {random2-[0,1]}', async function () {
        // Run it multiple times to be sure
        for(let i=0; i<50; i++) {
            const val = await processPlaceholders("{random2-[0,1]}");
            expect(val).to.match(/^[2-9]{2}$/);
        }
    });

    it('should respect single exclusion in {random2-[0]}', async function () {
        for(let i=0; i<50; i++) {
            const val = await processPlaceholders("{random2-[0]}");
            expect(val).to.match(/^[1-9]{2}$/);
        }
    });

    it('should work with arbitrary length and multiple exclusions e.g. {random3-[4,5,6]}', async function () {
        for(let i=0; i<50; i++) {
            const val = await processPlaceholders("{random3-[4,5,6]}");
            expect(val).to.match(/^[0-37-9]{3}$/);
        }
    });

    it('should replace street and postcode placeholders', async function () {
        const val = await processPlaceholders("{streetName} {streetType}, AU:{postcodeAU}, US:{postcodeUS}");
        expect(val).to.match(/^Example (Street|Road|Avenue|Lane|Drive|Court|Circuit|Place|Boulevard|Way), AU:\d{4}, US:12345$/);
    });

    it('should replace city and state placeholders', async function () {
        const val = await processPlaceholders("{city}, {stateAU}, {stateUS}");
        expect(val).to.match(/^New York, (NSW|VIC|QLD|WA|SA|TAS|ACT|NT), NY$/);
    });
});
