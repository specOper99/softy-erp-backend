module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'header-max-length': [2, 'always', 200],
        'body-max-line-length': [0, 'always', Infinity], // Disable body line length limit
        'subject-case': [0], // Disable subject case enforcement
        'subject-full-stop': [0], // Allow full stops in subject
    },
};
