import { authenticationHandler } from '../../server/authentication';
export default async (request: Request) => authenticationHandler(request);
export const config = { path: '/.netlify/functions/authentication/:action' };
