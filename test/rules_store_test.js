import chai from 'chai';
const expect = chai.expect;
// Mock chrome global
if (!global.chrome) {
    global.chrome = {
        runtime: { lastError: undefined },
        storage: { local: { get: () => { } } }
    };
}

import { findMatchingRules } from '../src/extension/shared/rules-store.js';

describe('Rules Store Matching', function () {

    it('should match using new named forms schema', async function () {
        const rules = {
            forms: {
                "My Signup Form": {
                    urlPattern: "/signup",
                    fields: []
                },
                "Other Form": {
                    urlPattern: "/other",
                    fields: []
                }
            }
        };

        global.chrome.storage.local.get = async () => ({ 'testofill.rules': rules });

        const matches = await findMatchingRules("https://example.com/signup");
        expect(matches).to.have.lengthOf(1);
        expect(matches[0].name).to.equal("My Signup Form");
        expect(matches[0].urlPattern).to.equal("/signup");
    });

    it('should match multiple forms for same URL', async function () {
        const rules = {
            forms: {
                "Form A": { urlPattern: "/login", fields: [] },
                "Form B": { urlPattern: "/login", fields: [] }
            }
        };

        global.chrome.storage.local.get = async () => ({ 'testofill.rules': rules });

        const matches = await findMatchingRules("https://example.com/login");
        expect(matches).to.have.lengthOf(2);
    });

    it('should support legacy schema', async function () {
        const rules = {
            forms: {
                "/old-pattern": [{ fields: [] }]
            }
        };

        global.chrome.storage.local.get = async () => ({ 'testofill.rules': rules });

        const matches = await findMatchingRules("https://example.com/old-pattern");
        expect(matches).to.have.lengthOf(1);
        // Legacy matches don't strictly have a 'name' added by us unless we did it (we didn't for array items)
    });

    it('should automatically detect environment from URL', async function () {
        const rules = {
            environments: {
                "example": {
                    "us": "https://example-us.app.com/",
                    "au": "https://example-au.app.com/"
                }
            },
            forms: {
                "Any Form": {
                    urlPattern: "/login",
                    fields: []
                }
            }
        };

        global.chrome.storage.local.get = async () => ({ 'testofill.rules': rules });

        // Test US match
        const matchesUS = await findMatchingRules("https://example-us.app.com/login");
        expect(matchesUS).to.have.lengthOf(1);
        expect(matchesUS[0].context.country).to.equal("US");

        // Test AU match
        const matchesAU = await findMatchingRules("https://example-au.app.com/login");
        expect(matchesAU).to.have.lengthOf(1);
        expect(matchesAU[0].context.country).to.equal("AU");
    });
});
