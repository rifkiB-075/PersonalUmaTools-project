import { api } from './client';

// Health
export const checkHealth = () => api.get('/health').then((r) => r.data);

// Racetracks
export const getRacetracks = () => api.get('/racetracks').then((r) => r.data.racetracks);
export const getCourses = (racetrackId) =>
  api.get(`/racetracks/${racetrackId}/courses`).then((r) => r.data.courses);

// Courses
export const getValidSkills = (courseId, onlyValid = false) =>
  api
    .get(`/courses/${courseId}/valid-skills`, { params: { onlyValid } })
    .then((r) => r.data);

// Skills
export const getSkill = (skillId) =>
  api.get(`/skills/${skillId}`).then((r) => r.data);

export const searchSkills = (search = '', limit = 50) =>
  api.get('/skills', { params: { search, limit } }).then((r) => r.data.skills);

// Simulate
export const simulate = (body) =>
  api.post('/simulate', body).then((r) => r.data);

export const simulateSkillCheck = (body) =>
  api.post('/simulate/skill-check', body).then((r) => r.data);

// Uma analyze (integrated endpoint)
export const analyzeUma = (body) =>
  api.post('/uma/analyze', body).then((r) => r.data);

// Characters
export const getCharacters = (search = '', limit = 150) =>
  api.get('/characters', { params: { search, limit } }).then((r) => r.data);

export const getCharacter = (id) =>
  api.get(`/characters/${id}`).then((r) => r.data);
