// 기본 캐릭터 20명. 모두 같은 유치원 원복(노란 셔츠, 파란 하의)을 입고,
// 피부색, 머리 모양과 색, 안경, 하의, 가방 색, 머리핀으로 구분한다.
// level은 1(노랑 모자)로 시작한다. 레벨업은 spec.level만 바꿔서 시트를 다시 만들면 된다.

export const CHARACTERS = [
  { id: 'kid01', name: '도윤', skin: 'light', hair: { style: 'short', color: 'darkbrown' }, bag: 'orange' },
  { id: 'kid02', name: '하린', skin: 'light', hair: { style: 'long', color: 'darkbrown' }, bottom: 'navy', bag: 'orange' },
  { id: 'kid03', name: '지호', skin: 'light', hair: { style: 'side', color: 'black' }, glasses: true, bag: 'orange' },
  { id: 'kid04', name: '서아', skin: 'light', hair: { style: 'bob', color: 'pink' }, bag: 'orange' },
  { id: 'kid05', name: '건우', skin: 'tan', hair: { style: 'spiky', color: 'black' }, bag: 'green' },
  { id: 'kid06', name: '유나', skin: 'light', hair: { style: 'ponytail', color: 'black' }, bag: 'orange' },
  { id: 'kid07', name: '민재', skin: 'deep', hair: { style: 'curly', color: 'black' }, bag: 'sky' },
  { id: 'kid08', name: '채원', skin: 'fair', hair: { style: 'twintail', color: 'chestnut' }, bottom: 'skirt', bag: 'red', pin: '#ff8fb1' },
  { id: 'kid09', name: '시우', skin: 'light', hair: { style: 'bowl', color: 'brown' }, bag: 'brown' },
  { id: 'kid10', name: '예린', skin: 'tan', hair: { style: 'long', color: 'black' }, bottom: 'skirt', glasses: true, bag: 'sky' },
  { id: 'kid11', name: '준서', skin: 'light', hair: { style: 'buzz', color: 'darkbrown' }, bag: 'green' },
  { id: 'kid12', name: '수아', skin: 'light', hair: { style: 'bob', color: 'black' }, bottom: 'skirt', bag: 'orange', pin: '#7ed3ff' },
  { id: 'kid13', name: '현우', skin: 'fair', hair: { style: 'short', color: 'blonde' }, bag: 'red' },
  { id: 'kid14', name: '다은', skin: 'deep', hair: { style: 'twintail', color: 'black' }, bottom: 'skirt', bag: 'green', pin: '#ffd23f' },
  { id: 'kid15', name: '태민', skin: 'tan', hair: { style: 'side', color: 'navy' }, bag: 'brown' },
  { id: 'kid16', name: '지안', skin: 'fair', hair: { style: 'ponytail', color: 'lilac' }, bag: 'sky' },
  { id: 'kid17', name: '우진', skin: 'light', hair: { style: 'curly', color: 'chestnut' }, glasses: true, bag: 'orange' },
  { id: 'kid18', name: '소율', skin: 'light', hair: { style: 'long', color: 'mint' }, bottom: 'skirt', bag: 'red', pin: '#ffffff' },
  { id: 'kid19', name: '하준', skin: 'deep', hair: { style: 'spiky', color: 'ash' }, bag: 'sky' },
  { id: 'kid20', name: '나은', skin: 'tan', hair: { style: 'bowl', color: 'darkbrown' }, bottom: 'skirt', glasses: true, bag: 'green' },
];
