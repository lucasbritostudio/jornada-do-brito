export const NextResponse = {
  json(value, init = {}) {
    return new Response(JSON.stringify(value), {
      headers: { 'content-type': 'application/json' },
      ...init,
    });
  },
};
