export type LoginProviderButton = {
  name: string;
  eyebrow: string;
  href: string;
  mark: string;
  tone: string;
};

type LoginProviderButtonsProps = {
  providers: LoginProviderButton[];
};

export function LoginProviderButtons({ providers }: LoginProviderButtonsProps) {
  return (
    <div className="provider-list">
      {providers.map((provider) => (
        <a className="provider-button" href={provider.href} key={provider.name}>
          <span className={`provider-mark provider-${provider.tone}`}>
            {provider.mark}
          </span>
          <span>
            <strong>{provider.name}로 계속하기</strong>
            <small>{provider.eyebrow}</small>
          </span>
          <b aria-hidden="true">&rarr;</b>
        </a>
      ))}
    </div>
  );
}
