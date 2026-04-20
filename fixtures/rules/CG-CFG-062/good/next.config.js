module.exports = {
  async rewrites() {
    return [
      { source: "/api/upstream/:path*", destination: "https://api.example.com/:path*" },
    ];
  },
};
