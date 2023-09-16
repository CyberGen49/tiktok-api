
const fs = require('fs');
const express = require('express');
const logger = require('cyber-express-logger');
const axios = require('axios');
const ejs = require('ejs');
const storage = (fs.existsSync('./data.json')) ? require('./data.json') : {
    videos: {}
};
const config = require('./config.json');

const writeStorage = () => fs.writeFileSync('./data.json', JSON.stringify(storage, null, 4));

const srv = express();
srv.use(logger({
    getIP: req => req.headers['cf-connecting-ip'],
}));

const getVideoData = async id => {
    if (id.toString().length == 9) {
        try {
            const page = await axios.get(`https://vm.tiktok.com/${id}`);
            const html = page.data;
            const matches = html.match(/property="og:url" +content="https:\/\/www.tiktok.com\/@.*?\/video\/(.*?)\?/);
            id = matches[1];
        } catch (error) {}
    }
    if (storage.videos[id])
        return storage.videos[id];
    const res = await axios.get(`https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id=${id}`);
    if (!res.data?.aweme_list?.length) return null;
    const data = res.data.aweme_list[0];
    if (data.aweme_id !== id) return null;
    const compiled = {
        id: data.aweme_id,
        desc: data.desc,
        create_time: data.create_time,
        author: {
            id: data.author.uid,
            username: data.author.unique_id,
            name: data.author.nickname,
            avatar: data.author.avatar_larger.url_list[0]
        },
        video_url: data.video.play_addr.url_list[0],
        fetch_time: Date.now()
    };
    storage.videos[id] = compiled;
    writeStorage();
    return compiled;
};

srv.get('/', async(req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(await ejs.renderFile('./ejs/home.ejs', {
        config
    }));
});
srv.get('/v', (req, res) => res.redirect('/'));
srv.get('/v/:id', async(req, res) => {
    const id = req.params.id;
    const data = await getVideoData(id);
    if (!data) return res.status(404);
    res.setHeader('Content-Type', 'text/html');
    res.end(await ejs.renderFile('./ejs/video.ejs', {
        data,
        origin: config.http.origin
    }));
});
srv.get('/v/:id/video.mp4', async(req, res) => {
    const id = req.params.id;
    const data = await getVideoData(id);
    if (!data) return res.status(404);
    res.redirect(data.video_url);
});
srv.get('/v/:id/json', async(req, res) => {
    const id = req.params.id;
    const data = await getVideoData(id);
    if (!data) return res.status(404).json({
        success: false
    });
    res.json({
        success: true,
        data
    });
});
srv.get('/v/:id/oembed.json', async(req, res) => {
    const id = req.params.id;
    const data = await getVideoData(id);
    if (!data) return res.status(404).json({});
    res.json({
        version: '1.0',
        type: 'video',
        title: data.desc,
        provider_name: 'TikTok Rich Embed',
        provider_url: config.http.origin,
        author_name: `@${data.author.username}`,
        author_url: `https://www.tiktok.com/@${data.author.username}`
    });
});

const port = config.http.port;
srv.listen(port, console.log(`Listening on port ${port}`));

setInterval(() => {
    for (const id in storage.videos) {
        const video = storage.videos[id];
        if ((Date.now()-video.fetch_time) < 1000*60*60*config.cache_time_hours) {
            delete storage.videos[id];
            console.log(`Deleted cached data for video`, id);
        }
    }
    writeStorage();
}, 1000*60);