import './story.css';
import type { Metadata } from 'next';
import { NotoSansKr } from '@/components/site/NotoSansKr';
import { LoginGateLink } from '@/components/site/LoginGateLink';

export const metadata: Metadata = {
  title: "브랜드 스토리",
  description: "돌봄이 멈추는 자리에서, 일상을 다시 잇습니다. 어르신의 안전한 외출과 보호자의 안심을 함께하는 위드브릿지의 이야기.",
};

/** 브랜드 스토리 | 위드브릿지 WithBridge — public/story.html 에서 옮김 */
export default function StoryPage() {
  return (
    <>
      <NotoSansKr />
      <main className="story-page">
        {/* SECTION 1. HERO */}
        <section className="hero">
          <div className="container">
            <h1>
              <span>
                돌봄이 멈추는 자리에서,
              </span>
              {' '}
              <span className="accent">
                일상을 다시 잇습니다.
              </span>
            </h1>
            <div className="body">
              <p>
                대한민국은 초고령사회에 들어섰습니다. 하지만 병원 가는 길, 오랜만의 외출처럼 일상의 많은 순간은 여전히 가족의 부담으로 남아있습니다.
              </p>
              <p>
                보호자는 일과 돌봄 사이에서 매일 고민하고, 어르신은 미안한 마음에 문밖을 망설입니다.
              </p>
              <p className="strong">
                위드브릿지는 가족이 미처 채우지 못한 그 공백 위에 따뜻한 다리를 놓습니다.{' '}
                <br />
                어르신에게는 안전한 외출을, 보호자에게는 안심할 수 있는 하루를 선물합니다.
              </p>
            </div>
          </div>
        </section>
        {/* SECTION 2. VISION & MISSION */}
        <section className="vision">
          <div className="container">
            <h2>
              나이 듦이 단절이 되지 않는 사회
            </h2>
            <p className="lead mission">
              위드브릿지는 어르신의 삶이 집 안에 머무르지 않도록, 검증된 매니저와 실시간 안심 소통으로 일상의 이동을 함께합니다.
            </p>
            <div className="values">
              <article className="value">
                <span className="num">
                  01
                </span>
                <h3>
                  신뢰할 수 있는 동행
                </h3>
                <p>
                  검증된 케어 매니저가 집 앞 픽업부터 진료, 약 수령, 귀가까지 전 과정을 밀착 케어합니다.
                </p>
              </article>
              <article className="value">
                <span className="num">
                  02
                </span>
                <h3>
                  실시간 안심 공유
                </h3>
                <p>
                  출발과 도착, 이동 상황과 진료 전달사항을 카카오톡 알림톡 및 안심 리포트로 보호자에게 실시간 전합니다.
                </p>
              </article>
              <article className="value">
                <span className="num">
                  03
                </span>
                <h3>
                  존엄한 일상 지원
                </h3>
                <p>
                  단순 수동적 케어가 아닌, 어르신의 의사와 습관을 존중하며 익숙한 일상을 오래 이어가시도록 돕습니다.
                </p>
              </article>
            </div>
          </div>
        </section>
        {/* SECTION 3. TRUST & SAFETY */}
        <section className="trust">
          <div className="container">
            <h2>
              안심은 약속이 아니라,
              <br />
              철저한 확인입니다.
            </h2>
            <p className="lead">
              어르신의 하루를 맡기는 일에 소홀함이 없도록, 위드브릿지는 사람을 고르는 일부터 모든 단계를 엄격하게 관리합니다.
            </p>
            <ol className="steps" aria-label="매니저 4단계 검증 체계">
              <li className="step">
                <span className="num">
                  01
                </span>
                <strong>
                  서류 및 자격 심사
                </strong>
              </li>
              <li className="step">
                <span className="num">
                  02
                </span>
                <strong>
                  심층 대면 인터뷰
                </strong>
              </li>
              <li className="step">
                <span className="num">
                  03
                </span>
                <strong>
                  전문 케어 교육 이수
                </strong>
              </li>
              <li className="step">
                <span className="num">
                  04
                </span>
                <strong>
                  현장 실습 및 지속 평가
                </strong>
              </li>
            </ol>
            <ul className="badges" aria-label="안심 시스템">
              <li className="badge">
                전문 매니저 100% 자격 검증
              </li>
              <li className="badge">
                어르신 맞춤 1:1 전담 케어
              </li>
              <li className="badge">
                카카오톡 실시간 안심 알림톡 전송
              </li>
            </ul>
          </div>
        </section>
        {/* SECTION 4. CLOSING CTA */}
        <section className="closing">
          <div className="container">
            <h2>
              <span>
                위드브릿지는 어르신의 오늘을,
              </span>
              {' '}
              <span>
                보호자의 마음까지 함께 모십니다.
              </span>
            </h2>
            <LoginGateLink className="btn" href="/apply">
              지금 동행 신청하기
            </LoginGateLink>
          </div>
        </section>
      </main>
    </>
  );
}
