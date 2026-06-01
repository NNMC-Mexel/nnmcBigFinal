import { factories } from '@strapi/strapi';

// Core CRUD routes. Access is enforced inside the controller:
//  - find / findOne: any authenticated user
//  - create: any authenticated user (author forced to current user)
//  - update / delete: comment author or a news moderator (SuperAdmin / canManageNews)
export default factories.createCoreRouter('api::news-comment.news-comment');
