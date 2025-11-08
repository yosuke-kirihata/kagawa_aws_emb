export const handler = async (event) => {
  try {
    const auth = (event?.authorizationToken || event?.headers?.Authorization || '').trim();
    if (!auth.startsWith('Basic ')) return deny('anonymous', event.methodArn);
    const b64 = auth.slice(6);
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');
    const ok = user === (process.env.BASIC_USER || 'user') && pass === (process.env.BASIC_PASSWORD || '');
    return ok ? allow(user, event.methodArn) : deny(user || 'anonymous', event.methodArn);
  } catch {
    return deny('anonymous', event?.methodArn || '*');
  }
};

function allow(principalId, resource) {
  return policy(principalId, resource, 'Allow');
}
function deny(principalId, resource) {
  return policy(principalId, resource, 'Deny');
}
function policy(principalId, resource, effect) {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }],
    },
    context: {},
  };
}
