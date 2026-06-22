// lib/anilist-queries.ts
// ✅ Exact GraphQL query strings verified against AniList v2 API

const MEDIA_FIELDS = `
  id
  title {
    romaji
    english
    native
  }
  coverImage {
    large
    color
  }
  bannerImage
  description
  averageScore
  episodes
  status
  genres
  season
  seasonYear
  format
  trending
  popularity
  trailer {
    id
    site
  }
  nextAiringEpisode {
    airingAt
    episode
    timeUntilAiring
  }
`;

export const TRENDING_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
        perPage
        total
      }
      media(type: ANIME, sort: TRENDING_DESC) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const POPULAR_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
        perPage
        total
      }
      media(type: ANIME, sort: POPULARITY_DESC) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const SEARCH_QUERY = `
  query ($search: String, $page: Int, $perPage: Int, $genres: [String], $sort: [MediaSort]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        currentPage
        hasNextPage
        lastPage
        perPage
        total
      }
      media(type: ANIME, search: $search, genre_in: $genres, sort: $sort) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

export const ANIME_DETAIL_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_FIELDS}
      relations {
        edges {
          relationType
          node {
            id
            title { romaji english }
            coverImage { large }
            format
            status
          }
        }
      }
      characters(sort: ROLE, perPage: 12) {
        edges {
          role
          node {
            id
            name { full }
            image { medium }
          }
        }
      }
      recommendations(perPage: 8) {
        nodes {
          mediaRecommendation {
            id
            title { romaji english }
            coverImage { large }
            averageScore
          }
        }
      }
    }
  }
`;
