export function isSafeRepositoryPath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('\0')
    && !value.startsWith('/')
    && !value.startsWith('\\')
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !value.split(/[\\/]/u).includes('..');
}
