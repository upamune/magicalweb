import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

const merchandise = [
  {
    id: 1,
    name: 'マヂカル.fm ステッカー',
    price: 500,
    image: '/merch/sticker.jpg',
    link: 'https://magical.fm/merch/sticker',
  },
  {
    id: 2,
    name: 'マヂカル.fm Tシャツ',
    price: 3500,
    image: '/merch/tshirt.jpg',
    link: 'https://magical.fm/merch/tshirt',
  },
];

export default function MerchCarousel() {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <Swiper
        modules={[Navigation, Pagination, Autoplay]}
        spaceBetween={30}
        slidesPerView={1}
        navigation
        pagination={{ clickable: true }}
        autoplay={{ delay: 5000 }}
        breakpoints={{
          640: {
            slidesPerView: 2,
          },
        }}
        className="py-8"
      >
        {merchandise.map((item) => (
          <SwiperSlide key={item.id}>
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow"
            >
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-48 object-cover"
              />
              <div className="p-4">
                <h3 className="text-lg font-bold mb-2">{item.name}</h3>
                <p className="text-primary">¥{item.price.toLocaleString()}</p>
              </div>
            </a>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}