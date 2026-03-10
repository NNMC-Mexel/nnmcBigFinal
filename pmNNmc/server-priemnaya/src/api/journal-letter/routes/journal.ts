export default {
  routes: [
    {
      method: 'GET',
      path: '/journal/lookups',
      handler: 'journal.lookups',
      config: { auth: false }
    },
    {
      method: 'POST',
      path: '/journal/login',
      handler: 'journal.login',
      config: { auth: false }
    },
    {
      method: 'GET',
      path: '/journal/me',
      handler: 'journal.me',
      config: { auth: false }
    },
    {
      method: 'GET',
      path: '/journal/letters',
      handler: 'journal.listLetters',
      config: { auth: false }
    },
    {
      method: 'POST',
      path: '/journal/letters',
      handler: 'journal.createLetter',
      config: { auth: false }
    },
    {
      method: 'GET',
      path: '/journal/letters/:id',
      handler: 'journal.getLetter',
      config: { auth: false }
    },
    {
      method: 'PUT',
      path: '/journal/letters/:id',
      handler: 'journal.updateLetter',
      config: { auth: false }
    },
    {
      method: 'DELETE',
      path: '/journal/letters/:id',
      handler: 'journal.deleteLetter',
      config: { auth: false }
    },
    {
      method: 'GET',
      path: '/journal/letters/:id/history',
      handler: 'journal.letterHistory',
      config: { auth: false }
    }
  ]
};
