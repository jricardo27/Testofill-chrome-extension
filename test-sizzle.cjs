const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');

const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
<h3 class="Typographystyles__TypographyDefaultWrapper-lklkXP bTpINH"><span>Enter your verification code.</span></h3>
<div class="Inputstyles__WrapperStyled-bjybRN kfYeK CodeInputElementstyles__InputContainerStyled-jglBoA xgTDb" data-testid="test:id/input-wrapper"><div data-testid="test:id/field-wrapper" class="Inputstyles__FieldWrapperStyled-fCQnSr gwNFtm"><input id="verification_code__0" inputmode="numeric" pattern="[0-9]*" class="Inputstyles__InputStyled-cvbuQU gXKPBP" type="numeric" value="" name=""></div></div>
</body>
</html>
`);

// Load sizzle into jsdom
const sizzleContent = fs.readFileSync('/Users/ricardop/code/Testofill-chrome-extension/src/extension/content/lib/sizzle-20140125.min.js', 'utf8');

dom.window.eval(sizzleContent);

const Sizzle = dom.window.Sizzle;
const matches = Sizzle("span:contains('Enter your verification code')");
console.log("Matches:", matches.length);
if (matches.length > 0) {
  console.log("Element text:", matches[0].textContent);
}

const inputs = Sizzle("#verification_code__0");
console.log("Inputs:", inputs.length);
