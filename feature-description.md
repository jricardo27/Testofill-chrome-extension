# Testofill Config Features

This document describes the main features of the `testofill-config-example.json` file that need to be supported by the Testofill plugin for automated form filling in web applications.

## Core Configuration Structure

### 1. Multi-Environment Support
- **Environments section**: Different base URLs for different environments (e.g., `example.us` and `example.au`)
- **Country-specific URLs**: Support for US and AU endpoints
- **Environment switching**: Ability to select which environment to use

### 2. Form Definition System
- **Forms object**: Named form configurations with:
  - `urlPattern`: Regex patterns to match URLs (e.g., `"/signup/"`, `"/bill-details|/bill-review"`)
  - `waitForSelector`: CSS selector to wait for before filling
  - `fields`: Array of field definitions

### 3. Advanced Field Types
The plugin must support these field types with specific behaviors:

#### Input Fields
- **text/email/password**: Standard text input
- **file**: File upload (with note that manual selection is required)

#### Select Fields
- **dropdown selection**: Single value selection from `<select>` elements

#### Interactive Elements
- **checkbox**: Boolean values (`"true"`/`"false"`)
- **radio**: Radio button selection with attribute selectors (e.g., `input[name='membershipTier'][value='PAY_LATER']`)

### 4. Dynamic Value Placeholders
Critical feature for generating unique test data:
- **`{timestamp}`**: For unique identifiers (e.g., `test.user.t{timestamp}@example.com`)
- **`{random4}`**: 4-digit random values (e.g., `XXX-XX-{random4}` for SSN)
- **`{random6}`**: 6-digit random values (e.g., phone numbers, verification codes)

### 5. Field Configuration Options
Each field supports:
- **`selector`**: CSS selector for element location
- **`value`**: Value to fill (with placeholders)
- **`type`**: Field type (input, select, checkbox, radio, file)
- **`description`**: Human-readable description
- **`delay`**: Milliseconds to wait before filling this field
- **`country`**: Country-specific fields (e.g., SSN for US only)
- **`note`**: Additional notes for special cases

### 6. Workflow Automation
- **Workflows section**: Multi-step form sequences
- **Steps array**: Ordered list of form names to execute
- **`autoSubmit`**: Boolean to automatically submit forms
- **`delayBetweenSteps`**: Delay between workflow steps

### 7. Global Options
Behavioral settings:
- **`delayBetweenFields`**: Default delay between field fills
- **`scrollToField`**: Auto-scroll to each field
- **`highlightField`**: Visual highlighting of fields
- **`confirmBeforeSubmit`**: Safety confirmation
- **`debugMode`**: Debug logging
- **`autoDetectCountry`**: Automatic country detection
- **`retryFailedFields`**: Retry mechanism for failed fills
- **`maxRetries`**: Maximum retry attempts

### 8. Special Features

#### Country-Specific Logic
- Fields with `country` property (e.g., SSN only for US)
- Different ID document states for AU vs US
- Country-specific phone number formats

#### Conditional Field Support
- Multiple form definitions for same URL pattern (e.g., different signup scenarios)
- Alternative field selectors (`input[type='email']` vs `input[name='email']`)

#### Test Data Management
- Test credit card numbers (Visa test cards)
- Declined card scenarios for payment testing
- Generic company names and addresses
- Masked sensitive data (SSN format: `XXX-XX-{random4}`)

### 9. Documentation & Notes
- **Notes array**: Usage instructions and limitations
- **Field descriptions**: Human-readable explanations
- **Special handling notes**: e.g., file uploads require manual selection

## Implementation Requirements for Developer

1. **JSON Parser**: Full JSON configuration parsing with validation
2. **URL Pattern Matching**: Regex support for form detection
3. **CSS Selector Engine**: Robust element selection
4. **Placeholder Engine**: Dynamic value replacement system
5. **Wait Strategies**: Element visibility and interaction readiness
6. **Country Detection**: Automatic country-based field filtering
7. **Workflow Engine**: Multi-step form execution with delays
8. **Error Handling**: Retry mechanisms and graceful failures
9. **Debug Features**: Logging and visual feedback options
10. **Security**: Safe handling of sensitive test data

This configuration system is quite sophisticated and would require a comprehensive plugin implementation to support all these features effectively.
