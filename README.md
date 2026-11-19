# 청년 유치원 프론트엔드

메타버스 교육 공간의 웹 프론트엔드.

## 기술 스택

- React 19 + TypeScript + Vite
- Phaser 4 (맵, 캐릭터)
- Tailwind CSS 4

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 타입 검사 + 배포용 빌드
```

Node 20 이상이 필요하다.

## 폴더 구조

```
src/
  main.tsx   진입점
  App.tsx    최상위 컴포넌트
  game/      맵, 캐릭터 이동 등 Phaser 쪽 코드
  ui/        맵 위에 뜨는 화면 (React 컴포넌트)
```

## 작업 방식

- `main`에 직접 올리지 않는다.
- 각자 브랜치를 만들어 작업하고, MR(PR)로 올려 확인받은 뒤 합친다.
