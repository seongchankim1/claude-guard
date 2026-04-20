module.exports = {
  async rewrites() {
    return [
      { source: "/proxy/:host/:path*", destination: "https://${host}/${path}" },
    ];
  },
};
