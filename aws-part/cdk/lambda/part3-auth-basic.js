// HTTPリクエストを受けたらこの関数が起動します。
export const handler = async (event) => {
  try {
    const auth = (event?.authorizationToken || event?.headers?.Authorization || '').trim();
    // Basic認証の形式かどうかをチェックします。
    if (!auth.startsWith('Basic ')) return deny('anonymous', event.methodArn);
    // Basic認証の形式からユーザー名とパスワードを取得します。
    const b64 = auth.slice(6);
    // Base64でエンコードされたユーザー名とパスワードをデコードします。
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    // ユーザー名とパスワードを分割します。
    const [user, pass] = decoded.split(':');
    // ユーザー名とパスワードが一致するかどうかをチェックします。
    const ok = user === (process.env.BASIC_USER || 'user') && pass === (process.env.BASIC_PASSWORD || '');
    // 一致する場合は許可、一致しない場合は拒否します。
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
