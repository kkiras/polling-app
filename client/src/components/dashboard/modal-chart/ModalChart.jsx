import React from 'react';
import { PieChart } from '@rsuite/charts';

const data = []

export default () => <PieChart name="Pie Chart" data={data} legend={false} startAngle={210} />;