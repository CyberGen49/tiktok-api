
module.exports = {
    apps: [{
        name: 'tiktok-api',
        script: './server.js',
        watch: [ 'server.js', 'config.json' ]
    }]
};