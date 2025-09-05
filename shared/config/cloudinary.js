const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME || 'dwssxatb3',
  api_key: process.env.API_KEY || '264752912949985',
  api_secret: process.env.API_SECRET || 'Z7aoBTdH6RKFN0T5cng9adJANFQ'
});

module.exports = cloudinary;


