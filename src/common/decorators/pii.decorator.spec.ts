import { getPiiFields, PII, PII_METADATA_KEY } from './pii.decorator';

class UserDto {
  @PII()
  email!: string;

  @PII()
  phone!: string;

  name!: string;
}

describe('PII decorator', () => {
  it('stores metadata for @PII()-marked fields only', () => {
    expect(getPiiFields(UserDto)).toEqual(['email', 'phone']);
  });

  it('does not duplicate metadata when decorator runs twice', () => {
    class DuplicateDto {
      @PII()
      email!: string;
    }

    PII()(DuplicateDto.prototype, 'email');

    expect(getPiiFields(DuplicateDto)).toEqual(['email']);
  });

  it('returns empty array for classes without PII metadata', () => {
    class PlainDto {
      id!: string;
    }

    expect(getPiiFields(PlainDto)).toEqual([]);
    expect(Reflect.getMetadata(PII_METADATA_KEY, PlainDto)).toBeUndefined();
  });
});
