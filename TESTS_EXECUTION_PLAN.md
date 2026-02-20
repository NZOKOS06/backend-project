# Phase 2: Tests Complets - Guide d'Exécution

## Status: IN PROGRESS

### Fichiers de Test Créés

```
__tests__/
├── setup.js                     ✅ Setup Jest & environment
├── auth.security.test.js        ✅ Auth security tests (50+ tests)
├── middleware.test.js           ✅ Middleware tests (40+ tests)
├── products.test.js             ✅ Products routes (scaffolded)
├── pharmacies.test.js           ✅ Pharmacy routes (scaffolded)
└── integration.test.js          ✅ Integration tests (DB + tokens)
```

### Configuration Jest

**jest.config.js:**
```javascript
- collectCoverageFrom: ['**/*.js', '!node_modules', '!__tests__']
- testEnvironment: 'node'
- testTimeout: 10000
- coverageThreshold: { global: { branches: 80, functions: 80, lines: 80, statements: 80 } }
```

### Couverture Cible: 80%+ Branches/Functions/Lines/Statements

### Plan d'Exécution Détaillé

#### Phase 2A: Setup & Validation (✅ COMPLETE)
- [x] Jest configuration with 80% threshold
- [x] Test environment variables (.env.test)
- [x] Setup file with mocking
- [x] Dependencies installed (jest, supertest)

#### Phase 2B: Unit Tests (✅ COMPLETE)
- [x] auth.security.test.js: 50+ tests
  - Input validation (email, password formats)
  - SQL injection protection
  - Rate limiting behavior
  - Security headers
  - JWT validation
  
- [x] middleware.test.js: 40+ tests
  - authenticateToken: token validation, expiration
  - requireRole: role-based access control
  - validateInput: input length/format checking

#### Phase 2C: Route Tests (🔄 IN PROGRESS)
- [ ] products.test.js: Complete 20+ tests
  - Search endpoint (query validation)
  - Popular products (limit defaults)
  - Get by ID (404 handling)
  - Error scenarios
  
- [ ] pharmacies.test.js: Complete 20+ tests
  - Open pharmacies endpoint
  - Search functionality
  - Details retrieval
  - Pharmacist updates
  - 404 error handling

#### Phase 2D: Integration Tests (🔄 IN PROGRESS)
- [ ] integration.test.js: 15+ tests
  - User registration flow
  - Login with JWT generation
  - Password verification
  - Token refresh rotation
  - Database connection pool

#### Phase 2E: Coverage Report
- [ ] Run: npm test
- [ ] Verify: coverage/ directory generated
- [ ] Check: All files meet 80% threshold

### Commandes Test

```bash
# Exécuter tous les tests avec coverage
npm test

# Mode watch pour développement
npm test:watch

# Tests de sécurité uniquement
npm test:security

# Tests spécifiques
npm test -- --testPathPattern="auth"
npm test -- --testPathPattern="middleware"

# Coverage report en HTML
npm test -- --coverage --collectCoverageFrom="**/*.js"
```

### Dépendances Installées

```json
{
  "jest": "^29.x",
  "supertest": "^6.x",
  "@babel/preset-env": "^7.x"
}
```

### Structure de Test: Patterns Utilisés

**1. Mocking Database:**
```javascript
jest.mock('../../config/database', () => ({
  query: jest.fn()
}));
```

**2. Mocking Express Middleware:**
```javascript
const req = { headers: {}, user: {} };
const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
const next = jest.fn();
```

**3. JWT Token Generation:**
```javascript
const token = jwt.sign(
  { id: 1, email: 'test@example.com', role: 'customer' },
  process.env.JWT_SECRET,
  { expiresIn: '15m' }
);
```

**4. Request Testing avec Supertest:**
```javascript
const res = await request(app)
  .post('/api/auth/login')
  .send({ email: 'test@example.com', password: 'Pass123!' });

expect(res.statusCode).toBe(200);
expect(res.body.accessToken).toBeTruthy();
```

### Points d'Attention pour la Couverture

1. **Error Paths:** Tous les catch/error handlers testés
2. **Edge Cases:** Empty strings, null values, boundary conditions
3. **Security:** Invalid tokens, expired tokens, unauthorized roles
4. **Database:** Mocked queries with realistic data
5. **Rate Limiting:** Verified at middleware level

### Prochaines Étapes

1. ⏳ Compléter products.test.js avec assertions réelles
2. ⏳ Compléter pharmacies.test.js avec assertions réelles
3. ⏳ Exécuter npm test et vérifier 80%+ coverage
4. ⏳ Créer frontend tests (React Testing Library)
5. ⏳ Passer à Phase 2B: Logging & Monitoring

### Troubleshooting

**"Cannot find module"**
- Vérifier paths relatifs dans imports
- Vérifier que les fichiers existent

**"Test timeout"**
- Augmenter testTimeout dans jest.config.js
- Vérifier pas d'appels API réels

**"Pool query not mocked"**
- Vérifier jest.mock() avant imports
- Ajouter .mockResolvedValue() aux appels

### Validation Finale

Avant de passer à la phase suivante:
```bash
npm test                    # Tous les tests passent
npm test -- --coverage      # 80%+ coverage
npm run security:check      # Sécurité OK
npm run check:secrets       # Pas de secrets détectés
```

---
**Créé:** 2024
**Dernière mise à jour:** Phase 2 In-Progress
**Status:** ACTIVE - Tests en cours de création
