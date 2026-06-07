const crypto = require('crypto');

const parseCloudinaryUrl = (cloudinaryUrl) => {
  const match = cloudinaryUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!match) {
    throw new Error('Invalid CLOUDINARY_URL format');
  }

  return {
    apiKey: match[1],
    apiSecret: match[2],
    cloudName: match[3],
  };
};

const uploadImageToCloudinary = async (base64Data, folder, publicId) => {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudinaryUrl) {
    throw new Error('Missing CLOUDINARY_URL environment variable');
  }

  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(cloudinaryUrl);
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = [`timestamp=${timestamp}`];
  if (folder) paramsToSign.push(`folder=${folder}`);
  if (publicId) paramsToSign.push(`public_id=${publicId}`);

  const signature = crypto
    .createHash('sha1')
    .update(`${paramsToSign.sort().join('&')}${apiSecret}`)
    .digest('hex');

  const formData = new FormData();
  formData.append('file', base64Data);
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  if (folder) formData.append('folder', folder);
  if (publicId) formData.append('public_id', publicId);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || 'Cloudinary upload failed');
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
};

const deleteImageFromCloudinary = async (publicId) => {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (!cloudinaryUrl) {
    throw new Error('Missing CLOUDINARY_URL environment variable');
  }

  const { apiKey, apiSecret, cloudName } = parseCloudinaryUrl(cloudinaryUrl);
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = [`public_id=${publicId}`, `timestamp=${timestamp}`];
  const signature = crypto
    .createHash('sha1')
    .update(`${paramsToSign.sort().join('&')}${apiSecret}`)
    .digest('hex');

  const formData = new FormData();
  formData.append('api_key', apiKey);
  formData.append('timestamp', String(timestamp));
  formData.append('signature', signature);
  formData.append('public_id', publicId);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  if (!response.ok || result.result !== 'ok') {
    throw new Error(result.error?.message || 'Cloudinary delete failed');
  }
};

module.exports = {
  uploadImageToCloudinary,
  deleteImageFromCloudinary,
};
